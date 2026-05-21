# ── Cloudflare DNS for the SPA ──
# The zone already exists at Cloudflare with `api.habitpair.com` as a manual
# A record - we deliberately don't manage that one here.

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
