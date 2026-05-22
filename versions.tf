terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "infrastructure-iac-agx-terraform-state"
    key    = "infrastructure-iac-agx-terraform-state/terraform.tfstate"
    region = "eu-west-1"
  }
}
