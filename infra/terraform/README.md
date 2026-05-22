# AWS Infrastructure — Terraform

Provisions everything needed to run the two backend services (`auth-api`, `habits-api`) on a single-node k3s cluster on AWS, plus the static-site stack that serves the SPA:

- EC2 `t4g.small` with Ubuntu 24.04 ARM64, k3s auto-installed via cloud-init
- Elastic IP (destroyed with the stack — each cycle gets a new public IP + sslip.io hostname)
- Security groups (SSH + k3s API from your IP; HTTP/HTTPS from anywhere; RDS only from EC2)
- RDS `db.t4g.micro` PostgreSQL 16 in private subnets (password auto-generated)
- EC2 key pair imported from your local `~/.ssh/aws_learning_ed25519.pub`
- **S3 bucket + CloudFront distribution** serving the `apps/web` SPA at `https://habitpair.com`
- **ACM certificate** in `us-east-1` (CloudFront requirement), DNS-validated via Cloudflare
- **Cloudflare DNS records** for ACM validation + apex CNAME → CloudFront
- **GitHub OIDC provider + two IAM roles** (`gha-web-deploy`, `gha-terraform`) so GitHub Actions can deploy without long-lived AWS credentials

## One-command lifecycle

```bash
export AWS_PROFILE=development

make aws-up      # terraform apply + K8s bootstrap → ready-to-deploy cluster
make aws-deploy  # local docker build + push + rollout
make aws-status  # Terraform outputs + pod status
make aws-ssh     # SSH to the EC2

make aws-down    # terraform destroy everything (prompts for confirmation)
```

## What `make aws-up` does

1. `terraform apply` — provisions EC2, EIP, RDS (DB `auth`), security groups
2. Waits for cloud-init to signal k3s readiness (`/var/lib/k3s-ready` on the EC2)
3. Fetches `/etc/rancher/k3s/k3s.yaml`, rewrites server URL to the EC2 public IP, renames context to `aws-k3s`, merges into `~/.kube/config`
4. Creates the `habitpair` namespace + `db-credentials` Secret (auth-api's connection string)
5. SSHes into EC2 to create the `habits` database on RDS (RDS is in a private subnet, so psql runs from inside the VPC). Creates `habits-db-credentials` Secret.
6. Creates `auth-jwt-secret` (32-byte HS256 key, shared by both services). Preserves the existing value on re-runs so live sessions aren't invalidated.
7. Applies `infra/k8s/traefik-config.yaml` + `infra/k8s/overlays/aws`
8. Prints health URLs to curl (both services)

After bootstrap the cluster is fully configured but has no app image yet. Use `make aws-deploy` (or push to main → GitHub Actions).

## State

Terraform state is stored locally in `infra/terraform/terraform.tfstate` (gitignored). If the Mac disk dies, you'd need to import existing resources — or simpler, just `make aws-down` via the AWS console and start fresh.

Migrating to S3 + DynamoDB backend is a follow-up; documented at the end of this file.

## DB data across cycles

Every `make aws-down` destroys RDS with `skip_final_snapshot = true`. **All DB data is lost.** This is intentional for a learning project — Prisma migrations will re-apply on the app's next startup.

## Certificates and Let's Encrypt rate limit

Each up cycle allocates a new EIP → new public IP → new sslip hostname. Since LE's rate limit (5 certs/week) is per-domain, and each sslip hostname is technically a different domain, we don't hit the limit even with many cycles per day.

## Variables

Most defaults in `variables.tf` are appropriate for the AirHelp development account. Override any of them by creating `infra/terraform/terraform.tfvars` (gitignored) — see `terraform.tfvars.example`.

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `UnauthorizedOperation` on apply | Your SSO session expired | `aws sso login --profile development` |
| Bootstrap times out on `/var/lib/k3s-ready` | cloud-init failed | `make aws-ssh` → `sudo cat /var/log/cloud-init-output.log` |
| Bootstrap fails on `kubectl --context aws-k3s get nodes` | Your IP changed since security group was created | `terraform apply` again (picks up new IP via `checkip.amazonaws.com`) |
| `/api/auth/health` or `/api/habits/health` returns 404 | Ingress patch not updated, or Traefik cert still issuing | Wait ~60s for Let's Encrypt; check `kubectl logs -n kube-system -l app.kubernetes.io/name=traefik` |
| Plain `/api/health` returns 404 | Expected — every path is service-scoped. Use `/api/auth/health` or `/api/habits/health`. | — |

## Teardown verification

After `make aws-down` confirm nothing is billing:

```bash
# EC2 instances
aws ec2 describe-instances --profile development \
  --filters 'Name=tag:Project,Values=ivan-sandbox' \
  --query 'Reservations[].Instances[?State.Name!=`terminated`].[InstanceId,State.Name]' --output table

# RDS
aws rds describe-db-instances --profile development \
  --query 'DBInstances[?DBName==`auth`].[DBInstanceIdentifier,DBInstanceStatus]' --output table

# Elastic IPs (free while attached; $3.60/mo when dangling)
aws ec2 describe-addresses --profile development \
  --filters 'Name=tag:Project,Values=ivan-sandbox' \
  --query 'Addresses[*].[AllocationId,PublicIp,AssociationId]' --output table
```

All three should print empty tables.

## First-time bootstrap for the CI/CD pipeline

### One-time steps

1. **Get a Cloudflare API token** with `Zone:DNS:Edit` permission on `habitpair.com`. Cloudflare dashboard → My Profile → API Tokens → Create.
2. **Set the token + apply Terraform locally:**
   ```bash
   export TF_VAR_cloudflare_api_token=<token>
   export AWS_PROFILE=development
   make aws-up   # runs terraform apply + k8s bootstrap
   ```
3. **Create an IAM user for the web deploy.** The `romeo` SSO role can't create IAM resources, so do this in the AWS console (or ask an AirHelp admin):
   - User name suggestion: `habitpair-web-deploy`
   - Inline policy: same as `oidc.tf.disabled`'s `gha_web_deploy` policy — `s3:ListBucket` on the frontend bucket, `s3:GetObject/PutObject/DeleteObject` on `${bucket}/*`, `cloudfront:CreateInvalidation` + `cloudfront:GetInvalidation` on the distribution ARN.
   - Generate access keys for the user.
4. **Copy values into GitHub repo Variables + Secrets** (Settings → Secrets and variables → Actions):

   | Type | Name | Source |
   |---|---|---|
   | Variable | `WEB_BUCKET_NAME` | TF output `frontend_bucket_name` |
   | Variable | `WEB_DISTRIBUTION_ID` | TF output `frontend_distribution_id` |
   | Secret | `AWS_ACCESS_KEY_ID` | IAM user access key |
   | Secret | `AWS_SECRET_ACCESS_KEY` | IAM user secret access key |

   Get the TF outputs with `terraform output -json` from `infra/terraform/`.

### What happens after bootstrap

- Pushes to `apps/web/**` on `main` → `web-test.yaml` runs lint/typecheck/vitest, then `web-deploy.yaml` (gated via `workflow_run`) builds, syncs to S3, invalidates CloudFront
- PRs touching `infra/terraform/**` → `infra-ci.yaml` runs `terraform fmt -check`, `init -backend=false`, and `validate` (lint-only, no plan/apply)
- All `terraform apply` runs from a developer's laptop via `make aws-up` until OIDC + remote state are in place

### Deferred: OIDC role-assume for CI

The plan called for GitHub OIDC + two scoped IAM roles instead of access keys. The Terraform for that lives in `oidc.tf.disabled` (renamed because the `romeo` SSO role lacks `iam:CreateOpenIDConnectProvider` / `iam:CreateRole`). To re-enable:

1. Ask an AirHelp IAM admin to either grant your role `iam:*` on `arn:aws:iam::*:role/habitpair-*` + `iam:CreateOpenIDConnectProvider`, OR have them pre-provision the resources and we'll reference them via `data` sources.
2. Rename `oidc.tf.disabled` → `oidc.tf`.
3. Restore the OIDC outputs in `outputs.tf` (currently removed — see the comment in that file).
4. `terraform apply`.
5. Swap `web-deploy.yaml`'s access-key step back to `role-to-assume: ${{ vars.AWS_WEB_DEPLOY_ROLE_ARN }}` with `permissions: id-token: write`.
6. Restore the gated `plan` + `apply` jobs in `infra-ci.yaml` (was lint-only after OIDC was disabled).

### Deferred: Terraform state on S3

`infra-ci.yaml` currently runs `init -backend=false` precisely because state is still local. When you migrate state per the section below, restore the `terraform plan` + `apply` jobs (the previous version of the workflow is in `git log` under commit `71165be`).

## Migrating to S3 backend (follow-up)

1. Create an S3 bucket (once, outside this Terraform): `aws s3api create-bucket --bucket ivan-sandbox-tfstate --region eu-west-1 --create-bucket-configuration LocationConstraint=eu-west-1`
2. Enable versioning: `aws s3api put-bucket-versioning --bucket ivan-sandbox-tfstate --versioning-configuration Status=Enabled`
3. Add a `backend "s3"` block to `versions.tf`:
   ```hcl
   backend "s3" {
     bucket = "ivan-sandbox-tfstate"
     key    = "ivan-sandbox/terraform.tfstate"
     region = "eu-west-1"
   }
   ```
4. `terraform init -migrate-state`
