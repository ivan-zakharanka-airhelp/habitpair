# AWS Infrastructure — Terraform

Provisions everything needed to run the auth service on a single-node k3s cluster on AWS, plus the static-site stack that serves the SPA:

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

1. `terraform apply` — provisions EC2, EIP, RDS, security groups
2. Waits for cloud-init to signal k3s readiness (`/var/lib/k3s-ready` on the EC2)
3. Fetches `/etc/rancher/k3s/k3s.yaml`, rewrites server URL to the EC2 public IP, renames context to `aws-k3s`, merges into `~/.kube/config`
4. Creates the `habitpair` namespace + `db-credentials` Secret (uses the Terraform-generated RDS password)
5. Auto-updates `infra/k8s/overlays/aws/ingress-patch.yaml` with the new sslip hostname
6. Applies `infra/k8s/traefik-config.yaml` + `infra/k8s/overlays/aws`
7. Prints the URL to curl

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
| `/api/health` returns 404 | Ingress patch not updated, or Traefik cert still issuing | Wait ~60s for Let's Encrypt; check `kubectl logs -n kube-system -l app.kubernetes.io/name=traefik` |

## Teardown verification

After `make aws-down` confirm nothing is billing:

```bash
# EC2 instances
aws ec2 describe-instances --profile development \
  --filters 'Name=tag:Project,Values=ivan-sandbox' \
  --query 'Reservations[].Instances[?State.Name!=`terminated`].[InstanceId,State.Name]' --output table

# RDS
aws rds describe-db-instances --profile development \
  --query 'DBInstances[?DBName==`auth_service`].[DBInstanceIdentifier,DBInstanceStatus]' --output table

# Elastic IPs (free while attached; $3.60/mo when dangling)
aws ec2 describe-addresses --profile development \
  --filters 'Name=tag:Project,Values=ivan-sandbox' \
  --query 'Addresses[*].[AllocationId,PublicIp,AssociationId]' --output table
```

All three should print empty tables.

## First-time bootstrap for the CI/CD pipeline

The OIDC role that GitHub Actions assumes is itself managed by this Terraform — chicken-and-egg. The very first apply has to run locally; after that, all infra and web changes can flow through CI.

### One-time steps

1. **Get a Cloudflare API token** with `Zone:DNS:Edit` permission on `habitpair.com`. Cloudflare dashboard → My Profile → API Tokens → Create.
2. **Set the token + apply Terraform locally:**
   ```bash
   export TF_VAR_cloudflare_api_token=<token>
   export AWS_PROFILE=development
   make aws-up   # runs terraform apply + k8s bootstrap
   ```
3. **Copy four Terraform outputs into GitHub repo Variables** (Settings → Secrets and variables → Actions → Variables tab):

   | TF output | GitHub Variable |
   |---|---|
   | `frontend_bucket_name` | `WEB_BUCKET_NAME` |
   | `frontend_distribution_id` | `WEB_DISTRIBUTION_ID` |
   | `gha_web_deploy_role_arn` | `AWS_WEB_DEPLOY_ROLE_ARN` |
   | `gha_terraform_role_arn` | `AWS_TERRAFORM_ROLE_ARN` |

   Get the values with `terraform output -json` from `infra/terraform/`.

4. **Add one GitHub Secret:** `CLOUDFLARE_API_TOKEN` (same value as the local `TF_VAR_*`). Used by the `infra-ci` workflow.
5. **Configure the `production` GitHub Environment** (Settings → Environments → New environment → `production`):
   - Add yourself as a Required Reviewer. This is the manual-approval gate before any `terraform apply` runs in CI.

### What happens after bootstrap

- Pushes to `apps/web/**` on `main` → `web-ci.yaml` builds, syncs to S3, invalidates CloudFront
- PRs touching `infra/terraform/**` → `infra-ci.yaml` posts a `terraform plan` comment
- Merges to `main` touching `infra/terraform/**` → `infra-ci.yaml` waits for your approval on the `production` environment, then applies

### Caveat: Terraform state still lives on your laptop

`infra-ci.yaml` currently `terraform init`s against the same backend declared in `versions.tf`. As long as that's the local backend, the CI's `apply` job will operate against an empty state and try to recreate resources you've already provisioned. **Migrate the state to S3 (see the section below) before relying on `infra-ci.yaml`'s `apply` job in anger.** Until then, treat the workflow as plan-only and run `terraform apply` from your laptop.

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
