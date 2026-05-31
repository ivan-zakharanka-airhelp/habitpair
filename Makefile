.DEFAULT_GOAL := help
.PHONY: help setup install up web down db-up db-migrate db-migrate-habits db-studio build lint test test-e2e \
        k8s-setup k8s deploy \
        aws-up aws-bootstrap aws-down aws-status aws-ssh \
        aws-deploy aws-deploy-auth aws-deploy-habits aws-deploy-web aws-cleanup-manual

# ── First-time setup ──

setup: install db-up db-migrate  ## First-time project setup (one command)
	@if [ ! -f apps/web/.env ] && [ -f apps/web/.env.example ]; then cp apps/web/.env.example apps/web/.env; fi

install:                         ## Install all workspace deps + generate Prisma clients (per service)
	npm install
	npm run generate -w @habitpair/auth-api
	npm run generate -w @habitpair/habits-api

# ── Local development (no K8s, fastest feedback loop) ──

up: db-up                        ## Start the full local stack (postgres + auth-api + web)
	npm run dev

web:                             ## Run only the web SPA (no DB, no api)
	npm run dev:web

down:                            ## Stop local services
	docker compose -f infra/docker/docker-compose.yaml down

db-up:                           ## Start Postgres container (creates habitpair + habits_service DBs)
	docker compose -f infra/docker/docker-compose.yaml up -d

db-migrate:                      ## Run Prisma migrations for auth-api
	npm run migrate -w @habitpair/auth-api

db-migrate-habits:               ## Run Prisma migrations for habits-api
	npm run migrate -w @habitpair/habits-api

db-studio:                       ## Open Prisma Studio for auth-api (set service via -w to switch)
	npm run studio -w @habitpair/auth-api

# ── Build ──

build:                           ## Build all apps
	npm run build -w @habitpair/auth-api
	npm run build -w @habitpair/habits-api

# ── K8s local development (test K8s behavior on MacBook) ──

k8s-setup:                       ## Create k3d cluster (one-time)
	bash infra/scripts/setup-k3d.sh

k8s:                             ## Start Skaffold dev loop against local k3d
	skaffold dev --port-forward

# ── AWS infrastructure (Terraform + cloud-init + k8s bootstrap) ──

aws-cleanup-manual:              ## ONE-TIME — delete resources created before Terraform was in place.
	bash infra/scripts/cleanup-manual-resources.sh

aws-up:                          ## Provision AWS (Terraform) + bootstrap k8s. AWS_PROFILE required.
	cd infra/terraform && terraform init -upgrade && terraform apply -auto-approve
	bash infra/scripts/aws-bootstrap.sh

aws-bootstrap:                   ## Re-run K8s bootstrap only (idempotent). Useful after ingress/secret changes.
	bash infra/scripts/aws-bootstrap.sh

aws-down:                        ## Destroy everything (AWS + local kubeconfig). Prompts for confirmation.
	bash infra/scripts/aws-teardown.sh

aws-status:                      ## Show Terraform outputs + pod status.
	@cd infra/terraform && terraform output 2>/dev/null || echo "No Terraform state — nothing provisioned"
	@echo ""
	@kubectl --context aws-k3s get pods -n habitpair 2>/dev/null || echo "Cluster not reachable"

aws-ssh:                         ## SSH to the current EC2 instance.
	ssh -i ~/.ssh/aws_learning_ed25519 ubuntu@$$(cd infra/terraform && terraform output -raw public_ip)

aws-deploy: aws-deploy-auth aws-deploy-habits aws-deploy-web  ## Deploy both backends + frontend to AWS.

aws-deploy-auth:                 ## Build + push image + rollout auth-api on AWS k3s.
	$(eval IMAGE := ghcr.io/ivan-zakharanka-airhelp/habitpair/auth-api:manual-$(shell date +%Y%m%d-%H%M%S))
	docker build --platform linux/arm64 -t $(IMAGE) -f apps/auth-api/Dockerfile .
	docker push $(IMAGE)
	# Apply manifests first in case env/routes/middlewares changed since last deploy.
	# kustomize resets the image to its placeholder (manual-1), so we set the real
	# tag immediately after to avoid an ImagePullBackOff window.
	kubectl --context aws-k3s apply -k infra/k8s/overlays/aws
	kubectl --context aws-k3s set image -n habitpair deployment/auth-api auth-api=$(IMAGE) migrate=$(IMAGE)
	kubectl --context aws-k3s rollout status -n habitpair deployment/auth-api --timeout=120s

aws-deploy-habits:               ## Build + push image + rollout habits-api on AWS k3s.
	$(eval IMAGE := ghcr.io/ivan-zakharanka-airhelp/habitpair/habits-api:manual-$(shell date +%Y%m%d-%H%M%S))
	docker build --platform linux/arm64 -t $(IMAGE) -f apps/habits-api/Dockerfile .
	docker push $(IMAGE)
	kubectl --context aws-k3s apply -k infra/k8s/overlays/aws
	kubectl --context aws-k3s set image -n habitpair deployment/habits-api habits-api=$(IMAGE) migrate=$(IMAGE)
	kubectl --context aws-k3s rollout status -n habitpair deployment/habits-api --timeout=120s

aws-deploy-web:                  ## Build SPA + sync to S3 + invalidate CloudFront.
	$(eval BUCKET := $(shell cd infra/terraform && terraform output -raw frontend_bucket_name))
	$(eval DIST_ID := $(shell cd infra/terraform && terraform output -raw frontend_distribution_id))
	VITE_AUTH_API_URL=https://api.habitpair.com/api VITE_HABITS_API_URL=https://api.habitpair.com/api npm run build -w @habitpair/web
	aws s3 sync apps/web/dist/ s3://$(BUCKET)/ \
		--delete \
		--exclude "index.html" \
		--cache-control "public, max-age=31536000, immutable"
	aws s3 cp apps/web/dist/index.html s3://$(BUCKET)/index.html \
		--cache-control "no-cache, no-store, must-revalidate" \
		--content-type "text/html; charset=utf-8"
	aws cloudfront create-invalidation \
		--distribution-id $(DIST_ID) \
		--paths "/index.html" "/"

# ── Legacy Skaffold deploy target (kept for reference) ──

deploy:                          ## Build, push, deploy via Skaffold (alternative to make aws-deploy).
	skaffold run --default-repo ghcr.io/ivan-zakharanka-airhelp

# ── Quality ──

lint:                            ## Lint all code
	npm run lint -w @habitpair/auth-api
	npm run lint -w @habitpair/habits-api

test:                            ## Run unit tests
	npm test -w @habitpair/auth-api
	npm test -w @habitpair/habits-api

test-e2e:                        ## Run e2e tests
	npm run test:e2e -w @habitpair/auth-api
	npm run test:e2e -w @habitpair/habits-api

# ── Help ──

help:                            ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'
