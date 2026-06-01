#!/usr/bin/env bash
#
# k8s-migrate.sh — run a service's Prisma migrations as a Kubernetes Job and
# block until it succeeds. This is the "migrate before deploy" release step;
# the caller rolls out the app Deployment only after this returns 0.
#
#   k8s-migrate.sh <service> <image> [job-manifest]
#
#   service        auth-api | habits-api  (→ Job name "<service>-migrate")
#   image          full image ref to migrate with (same image the app will run)
#   job-manifest   path to the Job YAML (default: infra/k8s/jobs/<service>-migrate.yaml,
#                  resolved relative to this script's repo). Pass an explicit path
#                  when the file was staged elsewhere (e.g. CI scp's it to /tmp).
#
# Env overrides:
#   KUBECTL_CONTEXT   --context passed to every kubectl call (e.g. aws-k3s). Default: current context.
#   NAMESPACE         default: habitpair
#   TIMEOUT           seconds to wait for completion. Default: 300
#
# Portable to macOS bash 3.2 (no `wait -n`): polls Job status with jsonpath.
set -euo pipefail

SERVICE="${1:?usage: k8s-migrate.sh <service> <image> [job-manifest]}"
IMAGE="${2:?usage: k8s-migrate.sh <service> <image> [job-manifest]}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB_MANIFEST="${3:-$SCRIPT_DIR/../k8s/jobs/${SERVICE}-migrate.yaml}"
NAMESPACE="${NAMESPACE:-habitpair}"
TIMEOUT="${TIMEOUT:-300}"
JOB="${SERVICE}-migrate"

# Assemble the kubectl prefix once (optional --context).
KUBECTL=(kubectl)
[ -n "${KUBECTL_CONTEXT:-}" ] && KUBECTL+=(--context "$KUBECTL_CONTEXT")
KUBECTL+=(--namespace "$NAMESPACE")

[ -f "$JOB_MANIFEST" ] || { echo "✗ Job manifest not found: $JOB_MANIFEST" >&2; exit 1; }

echo "▸ Migrating $SERVICE with $IMAGE"

# A Job's pod template is immutable — re-applying over a finished/old Job fails.
# Delete first (waiting for full removal) so the apply always creates fresh.
"${KUBECTL[@]}" delete job "$JOB" --ignore-not-found --wait=true >/dev/null

# Substitute the image and create the Job.
sed "s|__IMAGE__|${IMAGE}|g" "$JOB_MANIFEST" | "${KUBECTL[@]}" apply -f - >/dev/null
echo "  Job/$JOB created — waiting up to ${TIMEOUT}s for completion"

# Poll for a terminal state. `kubectl wait` can only watch one condition at a
# time (so it can't fail fast on a failed Job), hence the manual loop.
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  succeeded="$("${KUBECTL[@]}" get job "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  failed="$("${KUBECTL[@]}" get job "$JOB" -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || true)"

  if [ "$succeeded" = "1" ]; then
    echo "✓ $SERVICE migration complete"
    exit 0
  fi
  if [ "$failed" = "True" ]; then
    echo "✗ $SERVICE migration FAILED — not deploying. Logs:" >&2
    "${KUBECTL[@]}" logs "job/$JOB" --tail=200 >&2 || true
    exit 1
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "✗ $SERVICE migration did not finish within ${TIMEOUT}s — not deploying. Logs:" >&2
    "${KUBECTL[@]}" logs "job/$JOB" --tail=200 >&2 || true
    exit 1
  fi
  sleep 3
done
