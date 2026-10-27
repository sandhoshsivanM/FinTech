terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in a versioned, encrypted S3 bucket with locking. The bucket
  # name is not committed: pass it at init time
  #   terraform init -backend-config="bucket=<state bucket>"
  backend "s3" {
    key          = "khazana/staging/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "khazana"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}
