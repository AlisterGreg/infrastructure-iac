# One-time setup: the IAM roles GitHub Actions assumes for the software-factory stack.
# Applied once from a workstation with local state (not committed). The state bucket is the
# existing one from the root configuration, so this stack creates no bucket.

terraform {
  required_version = ">= 1.15.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = "software-factory"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "github_repo" {
  description = "owner/name of the repository whose workflows assume the roles"
  type        = string
  default     = "AlisterGreg/infrastructure-iac"
}

variable "state_bucket" {
  description = "Existing S3 bucket holding Terraform state (the one in versions.tf)"
  type        = string
  default     = "infrastructure-iac-agx-terraform-state"
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider. Default false: the root configuration's AWS_ROLE_ARN already relies on one in this account. Set true only if the provider does not exist."
  type        = bool
  default     = false
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  state_arn  = "arn:aws:s3:::${var.state_bucket}"
  oidc_arn   = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "state_access" {
  statement {
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [local.state_arn]
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_arn}/*"]
  }
}

# Plan role: read-only on the account, plus state access so `terraform plan` can read and lock state.
# Trusted by pull requests only.
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "software-factory-gha-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-state"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_access.json
}

# Apply role: trusted only by the `production` GitHub environment, which requires approval.
# PowerUserAccess covers the services the factory uses. IAM is limited to roles and policies
# named software-factory-*, so this role cannot grant itself more.
data "aws_iam_policy_document" "apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:production"]
    }
  }
}

resource "aws_iam_role" "apply" {
  name               = "software-factory-gha-apply"
  assume_role_policy = data.aws_iam_policy_document.apply_trust.json
}

resource "aws_iam_role_policy_attachment" "apply_poweruser" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

data "aws_iam_policy_document" "apply_iam" {
  statement {
    actions = [
      "iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:PutRolePolicy",
      "iam:DeleteRolePolicy", "iam:ListAttachedRolePolicies", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:PassRole", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:CreatePolicy", "iam:DeletePolicy",
      "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:ListPolicyVersions", "iam:TagPolicy",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/software-factory-*",
      "arn:aws:iam::${local.account_id}:policy/software-factory-*",
    ]
  }
  statement {
    actions   = ["iam:GetRole", "iam:ListRoles"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "apply_iam" {
  name   = "software-factory-iam"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply_iam.json
}

resource "aws_iam_role_policy" "apply_state" {
  name   = "terraform-state"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.state_access.json
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  value = aws_iam_role.apply.arn
}
