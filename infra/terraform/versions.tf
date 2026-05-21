terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

# CloudFront requires ACM certs to live in us-east-1, regardless of
# which region the rest of the stack runs in.
provider "aws" {
  alias  = "useast1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  common_tags = {
    Owner       = var.owner_email
    Project     = var.project_name
    Environment = "sandbox"
    ManagedBy   = "terraform"
  }
}
