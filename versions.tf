terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "infrastructure-iac-terraform-state"
    key    = "infrastructure-iac/terraform.tfstate"
    region = "eu-west-1"
  }
}
