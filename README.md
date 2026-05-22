# infrastructure-iac

Terraform configuration for AWS infrastructure. State is stored remotely in S3.

## Requirements

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.15
- AWS credentials configured (via environment variables, `~/.aws/credentials`, or IAM role)

## Structure

```
infrastructure-iac/
├── main.tf        # AWS provider configuration
├── variables.tf   # Input variables
└── versions.tf    # Terraform and provider version constraints + S3 backend
```

## Remote State

State is stored in S3:

| Setting | Value |
|---------|-------|
| Bucket | `infrastructure-iac-terraform-state` |
| Key | `infrastructure-iac/terraform.tfstate` |
| Region | `eu-west-1` |

The S3 bucket must exist before running `terraform init`.

## Usage

```bash
# Initialise — downloads providers and connects to the S3 backend
terraform init

# Preview changes
terraform plan

# Apply changes
terraform apply
```

## Variables

| Name | Description | Default |
|------|-------------|---------|
| `aws_region` | AWS region to deploy resources into | `eu-west-1` |

Override a variable at plan/apply time:

```bash
terraform apply -var="aws_region=us-east-1"
```
