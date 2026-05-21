# ── GitHub Actions OIDC ──
# Lets workflows from this repo assume scoped IAM roles without long-lived
# access keys. Two roles: one narrow (web deploy), one broad (terraform).

locals {
  gha_repo_sub = "repo:${var.github_owner}/${var.github_repo}"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    # GitHub publishes these; they only change on cert rotation. AWS treats
    # them as a defense-in-depth check (the actual trust still hinges on the
    # JWT signature against the JWKS).
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  tags = local.common_tags
}

# ── gha-web-deploy: S3 sync + CloudFront invalidation only ──
# Trust allows any ref on the repo (branches, PRs, tags) so PR preview jobs
# work. The role's permissions are narrow enough that this is acceptable;
# we can tighten the trust later if needed.

data "aws_iam_policy_document" "gha_web_deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.gha_repo_sub}:*"]
    }
  }
}

resource "aws_iam_role" "gha_web_deploy" {
  name               = "${var.name_prefix}-gha-web-deploy"
  assume_role_policy = data.aws_iam_policy_document.gha_web_deploy_trust.json

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-gha-web-deploy"
  })
}

data "aws_iam_policy_document" "gha_web_deploy" {
  statement {
    sid       = "ListBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]
  }

  statement {
    sid       = "ReadWriteObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }

  statement {
    sid       = "InvalidateCache"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.frontend.arn]
  }
}

resource "aws_iam_role_policy" "gha_web_deploy" {
  name   = "${var.name_prefix}-gha-web-deploy"
  role   = aws_iam_role.gha_web_deploy.id
  policy = data.aws_iam_policy_document.gha_web_deploy.json
}

# ── gha-terraform: broader powers for `terraform apply` from CI ──
# Trust is restricted to main-only since infra-apply only runs from main.
# Permissions: PowerUserAccess (everything except IAM) + IAMFullAccess so
# subsequent applies can still manage the OIDC role itself. Sandbox-broad
# but acceptable for the stated scope.

data "aws_iam_policy_document" "gha_terraform_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.gha_repo_sub}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "gha_terraform" {
  name               = "${var.name_prefix}-gha-terraform"
  assume_role_policy = data.aws_iam_policy_document.gha_terraform_trust.json

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-gha-terraform"
  })
}

resource "aws_iam_role_policy_attachment" "gha_terraform_poweruser" {
  role       = aws_iam_role.gha_terraform.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy_attachment" "gha_terraform_iam" {
  role       = aws_iam_role.gha_terraform.name
  policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
}
