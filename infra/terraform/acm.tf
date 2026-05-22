# ── ACM certificate for the frontend (us-east-1, DNS-validated) ──
# CloudFront only accepts certs from us-east-1, hence the provider alias.
# Validation records are created in Cloudflare (see dns.tf).

resource "aws_acm_certificate" "frontend" {
  provider = aws.useast1

  domain_name       = var.frontend_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-frontend-cert"
  })
}

resource "aws_acm_certificate_validation" "frontend" {
  provider = aws.useast1

  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for r in cloudflare_record.acm_validation : r.hostname]
}
