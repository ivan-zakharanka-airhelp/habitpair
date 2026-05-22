#!/usr/bin/env bash
#
# aws-bootstrap.sh — post-Terraform Kubernetes bootstrap for AWS k3s.
#
# Idempotent: safe to re-run. Reads Terraform outputs (expects `terraform apply`
# to have completed). Performs everything a human would do after getting a
# fresh EC2 with k3s installed:
#
#   1. Wait for cloud-init to mark k3s ready
#   2. Fetch the kubeconfig from the EC2, rewrite server URL, rename context
#   3. Merge it into ~/.kube/config
#   4. Create the habitpair namespace + db-credentials secret
#   5. Apply Traefik HelmChartConfig + the AWS kustomize overlay
#   6. Print a summary with the URL to hit

set -euo pipefail

# ── Config ──
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$PROJECT_ROOT/infra/terraform"
KUBECONFIG_PATH="$HOME/.kube/k3s-aws.yaml"
CONTEXT_NAME="aws-k3s"
NAMESPACE="habitpair"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/aws_learning_ed25519}"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▸${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Sanity checks ──
[ -z "${AWS_PROFILE:-}" ] && fail "AWS_PROFILE not set. Run: export AWS_PROFILE=development"
[ ! -d "$TF_DIR" ] && fail "Terraform directory not found: $TF_DIR"
[ ! -f "$SSH_KEY" ] && fail "SSH key not found: $SSH_KEY (override with SSH_KEY=...)"
command -v terraform >/dev/null 2>&1 || fail "terraform CLI not installed"
command -v kubectl   >/dev/null 2>&1 || fail "kubectl not installed"

# ── 1. Read Terraform outputs ──
step "Reading Terraform outputs"
cd "$TF_DIR"
PUBLIC_IP=$(terraform output -raw public_ip 2>/dev/null)   || fail "No terraform state — run 'make aws-up' or 'terraform apply' first"
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
RDS_PORT=$(terraform output -raw rds_port)
DB_NAME=$(terraform output -raw db_name)
DB_USER=$(terraform output -raw db_username)
DB_PASSWORD=$(terraform output -raw db_password)
cd "$PROJECT_ROOT"
ok "Public IP: $PUBLIC_IP"

# Capture old EIP from the existing kubeconfig before step 3 overwrites it, so
# the summary can detect IP changes and nudge about the Cloudflare A record.
OLD_PUBLIC_IP=""
if [ -f "$KUBECONFIG_PATH" ]; then
  OLD_PUBLIC_IP=$(grep -oE 'https://[0-9.]+:6443' "$KUBECONFIG_PATH" 2>/dev/null | head -1 | sed -E 's|https://([0-9.]+):6443|\1|')
fi

# ── 1b. Clean up stale SSH host key ──
# Terraform replaces the EC2 when user_data changes; the new instance has a new
# host key. Without this, SSH blocks with "WARNING: REMOTE HOST IDENTIFICATION
# HAS CHANGED" and the poll loop below times out.
step "Removing any stale SSH host key for $PUBLIC_IP from known_hosts"
ssh-keygen -R "$PUBLIC_IP" >/dev/null 2>&1 || true

# ── 2. Wait for cloud-init ──
step "Waiting for cloud-init to finish on EC2 (k3s install marker /var/lib/k3s-ready)"
TIMEOUT=240
INTERVAL=5
for ((i = 0; i < TIMEOUT; i += INTERVAL)); do
  if ssh -q -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new \
       -i "$SSH_KEY" "ubuntu@$PUBLIC_IP" \
       'test -f /var/lib/k3s-ready' 2>/dev/null; then
    ok "k3s is ready on EC2"
    break
  fi
  printf "  waiting... %ds\r" "$i"
  sleep "$INTERVAL"
done
if ! ssh -q -o ConnectTimeout=5 -i "$SSH_KEY" "ubuntu@$PUBLIC_IP" 'test -f /var/lib/k3s-ready' 2>/dev/null; then
  fail "Timed out after ${TIMEOUT}s waiting for /var/lib/k3s-ready. Inspect cloud-init: ssh ubuntu@$PUBLIC_IP sudo cat /var/log/cloud-init-output.log"
fi

# ── 3. Fetch kubeconfig ──
step "Fetching kubeconfig to $KUBECONFIG_PATH"
mkdir -p "$(dirname "$KUBECONFIG_PATH")"
scp -q -o StrictHostKeyChecking=accept-new -i "$SSH_KEY" \
  "ubuntu@$PUBLIC_IP:/etc/rancher/k3s/k3s.yaml" "$KUBECONFIG_PATH"

# Rewrite server URL: 127.0.0.1 → EC2 public IP
sed -i.bak "s|https://127.0.0.1:6443|https://$PUBLIC_IP:6443|" "$KUBECONFIG_PATH"

# Rename cluster, user, and context from "default" → "aws-k3s".
# If we only renamed the context, merging into ~/.kube/config would collide with
# any existing "default" cluster/user entries — causing kubectl to silently use
# the wrong cluster config.
sed -i.bak \
  -e "s|^  name: default$|  name: $CONTEXT_NAME|" \
  -e "s|^- name: default$|- name: $CONTEXT_NAME|" \
  -e "s|^    cluster: default$|    cluster: $CONTEXT_NAME|" \
  -e "s|^    user: default$|    user: $CONTEXT_NAME|" \
  -e "s|^current-context: default$|current-context: $CONTEXT_NAME|" \
  "$KUBECONFIG_PATH"
rm -f "${KUBECONFIG_PATH}.bak"
ok "Kubeconfig saved, cluster/user/context renamed to '$CONTEXT_NAME'"

# ── 4. Merge into ~/.kube/config ──
step "Merging into ~/.kube/config"
mkdir -p "$HOME/.kube"
touch "$HOME/.kube/config"
TMP_MERGED=$(mktemp)
KUBECONFIG="$HOME/.kube/config:$KUBECONFIG_PATH" kubectl config view --flatten > "$TMP_MERGED"
mv "$TMP_MERGED" "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"
ok "Merged — try: kubectl config use-context $CONTEXT_NAME"

# ── 5. Cluster reachability ──
step "Testing cluster reachability"
if ! kubectl --context "$CONTEXT_NAME" get nodes >/dev/null 2>&1; then
  fail "Cannot reach cluster — is your IP in the EC2 security group for port 6443?"
fi
kubectl --context "$CONTEXT_NAME" get nodes
ok "Cluster reachable"

# ── 6. Namespace + db-credentials Secret (idempotent) ──
step "Creating namespace '$NAMESPACE' and db-credentials secret"
kubectl --context "$CONTEXT_NAME" create namespace "$NAMESPACE" \
  --dry-run=client -o yaml | kubectl --context "$CONTEXT_NAME" apply -f - >/dev/null

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${RDS_ENDPOINT}:${RDS_PORT}/${DB_NAME}"
kubectl --context "$CONTEXT_NAME" create secret generic db-credentials \
  --namespace "$NAMESPACE" \
  --from-literal=url="$DATABASE_URL" \
  --dry-run=client -o yaml | kubectl --context "$CONTEXT_NAME" apply -f - >/dev/null
ok "Secret applied (points at ${RDS_ENDPOINT})"

# ── 7. Apply Traefik HelmChartConfig + AWS overlay ──
step "Applying Traefik config + AWS kustomize overlay"
kubectl --context "$CONTEXT_NAME" apply -f "$PROJECT_ROOT/infra/k8s/traefik-config.yaml" >/dev/null
kubectl --context "$CONTEXT_NAME" apply -k "$PROJECT_ROOT/infra/k8s/overlays/aws" >/dev/null
ok "Manifests applied"

# ── 7b. Sync GitHub Actions secrets so the Deploy workflow points at the new EC2 ──
# Without this, pushing to main would SSH to a stale/destroyed IP and fail.
# Silently skipped if gh CLI isn't installed / authenticated.
step "Syncing GitHub Actions secrets (SERVER_HOST, SERVER_SSH_KEY)"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)
  if [ -n "$REPO" ]; then
    # Use --body / --body-file rather than stdin piping — avoids the gh 2.x
    # ambiguity where `--body -` has been interpreted as the literal value "-".
    gh secret set SERVER_HOST --repo "$REPO" --body "$PUBLIC_IP"
    if [ -f "$SSH_KEY" ]; then
      gh secret set SERVER_SSH_KEY --repo "$REPO" < "$SSH_KEY"
      ok "Secrets updated on $REPO (SERVER_HOST + SERVER_SSH_KEY)"
    else
      warn "SSH private key not found at $SSH_KEY — only SERVER_HOST was updated"
    fi
  else
    warn "Not inside a GitHub repo context — skipping (run 'gh repo view' to check)"
  fi
else
  warn "gh CLI missing or not authenticated — GitHub secrets NOT updated"
  warn "Install: brew install gh && gh auth login"
  warn "Or update manually: gh secret set SERVER_HOST --body '$PUBLIC_IP'"
fi

# ── 8. Summary ──
echo
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Cluster ready${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo
echo "  Context:       $CONTEXT_NAME"
echo "  Public IP:     $PUBLIC_IP"
echo "  Health URL:    https://api.habitpair.com/api/health"
echo "                 (cert provisioning takes ~60s on first request after a fresh cluster)"
echo "  RDS:           $RDS_ENDPOINT:$RDS_PORT/$DB_NAME"
echo "  SSH:           ssh -i $SSH_KEY ubuntu@$PUBLIC_IP"
echo

# Cloudflare A record for api.habitpair.com is managed by Terraform
# (infra/terraform/dns.tf), so it tracks the EIP automatically.
if [ -z "$OLD_PUBLIC_IP" ]; then
  echo "  Cloudflare A record for api.habitpair.com → $PUBLIC_IP (managed by Terraform)."
elif [ "$OLD_PUBLIC_IP" != "$PUBLIC_IP" ]; then
  echo "  Public IP changed: $OLD_PUBLIC_IP → $PUBLIC_IP"
  echo "  Cloudflare A record updated by Terraform — DNS may take up to 60s to propagate."
else
  echo "  Cloudflare A record for api.habitpair.com → $PUBLIC_IP unchanged."
fi
echo
echo "  Next step — deploy an image:"
echo "    make aws-deploy                (local build + push + rollout)"
echo "    git push origin main           (triggers GitHub Actions Deploy workflow)"
echo "    gh workflow run Deploy         (manually trigger Deploy from current main)"
echo
