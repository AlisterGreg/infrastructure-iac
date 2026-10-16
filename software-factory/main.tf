data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name       = var.project_name

  # Bedrock cross-region inference profiles route to foundation models in several regions,
  # so the foundation-model ARN uses a wildcard region.
  bedrock_resources = [
    "arn:aws:bedrock:${var.region}:${local.account_id}:inference-profile/${var.bedrock_model_id}",
    "arn:aws:bedrock:*:${local.account_id}:inference-profile/${var.bedrock_model_id}",
    "arn:aws:bedrock:*::foundation-model/anthropic.*",
  ]

  # Zip the whole src tree. Node.js needs no bundled packages: the AWS SDK is in the runtime.
  source_dir = var.app_source_dir
}

data "archive_file" "src" {
  type        = "zip"
  source_dir  = local.source_dir
  output_path = "${path.module}/build/src.zip"
}

resource "aws_secretsmanager_secret" "github_app_key" {
  name                    = var.github_app_secret_name
  description             = "GitHub App private key (PEM) for the software factory. Set the value with aws secretsmanager put-secret-value."
  recovery_window_in_days = 7
}
