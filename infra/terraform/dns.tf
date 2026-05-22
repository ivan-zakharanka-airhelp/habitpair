# ── Cloudflare DNS ──
# The zone already exists at Cloudflare. We manage:
#   - ACM validation CNAMEs (auto-renewed)
#   - apex CNAME for the SPA via CloudFront
#   - api.habitpair.com A record pointing at the current EC2 EIP

data "cloudflare_zone" "main" {
  name = var.frontend_domain
}

# ACM DNS validation: one CNAME per domain on the cert. Driven by ACM's
# domain_validation_options output so renewals stay automatic.
resource "cloudflare_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = data.cloudflare_zone.main.id
  name    = trimsuffix(each.value.name, ".")
  type    = each.value.type
  content = trimsuffix(each.value.value, ".")
  ttl     = 60
  proxied = false
}

# Apex CNAME → CloudFront. Cloudflare flattens apex CNAMEs automatically
# (CNAME-at-apex is allowed in their DNS). proxied = false because CloudFront
# already terminates TLS with our ACM cert; proxying through Cloudflare would
# double-proxy and break the SNI/host match.
resource "cloudflare_record" "frontend_apex" {
  zone_id = data.cloudflare_zone.main.id
  name    = "@"
  type    = "CNAME"
  content = aws_cloudfront_distribution.frontend.domain_name
  ttl     = 1 # Cloudflare automatic
  proxied = false
}

# api.habitpair.com → current EC2 EIP. The EIP rotates on every aws-up
# cycle (terraform destroys and recreates it when user_data changes), so
# letting Terraform manage this record avoids the manual "update the
# Cloudflare A record" step. Short TTL minimises stale resolution across
# cycles. proxied = false because Traefik on EC2 handles TLS via Let's
# Encrypt directly; proxying would break the cert chain.
resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = "api"
  type    = "A"
  content = aws_eip.main.public_ip
  ttl     = 60
  proxied = false
}
