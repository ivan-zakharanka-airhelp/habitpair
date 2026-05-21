# ── S3 bucket for the SPA build artifacts ──
# Private bucket, no public ACLs. CloudFront accesses it via OAC (signed
# requests), so it never needs website-mode hosting or public-read perms.

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.name_prefix}-app"

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-app"
  })
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    # Modern best practice: ACLs disabled entirely. All access is policy-based.
    object_ownership = "BucketOwnerEnforced"
  }
}

# ── CloudFront Origin Access Control ──
# OAC is the modern successor to OAI. It uses SigV4 to sign every CloudFront →
# S3 request so the bucket can stay fully private.

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.name_prefix}-frontend-oac"
  description                       = "OAC for ${var.name_prefix} frontend bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Bucket policy: allow CloudFront (this distribution only) to GetObject ──
# Scoped via AWS:SourceArn so other distributions / accounts can't read.

data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid    = "AllowCloudFrontServicePrincipalRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json
}

# ── CloudFront distribution ──
# SPA fallback: 403/404 from S3 are rewritten to /index.html with a 200 so the
# router can pick up the client-side route.

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.frontend_domain]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # SPA fallback - any "missing" path returns index.html so the client router
  # can resolve the route. error_caching_min_ttl = 0 so we don't pin a 404
  # response if we ever flip a real 404 path back.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    # AWS managed policies - referenced by their well-known IDs so we don't
    # need extra data lookups. Cannot be combined with forwarded_values
    # (the legacy path); managed policies fully replace it.
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-frontend"
  })

  # CloudFront refuses to come up if the cert isn't already issued+validated,
  # so be explicit about ordering.
  depends_on = [aws_acm_certificate_validation.frontend]
}
