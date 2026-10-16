variable "region" {
  description = "AWS region for every resource in this stack"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Prefix for resource names"
  type        = string
  default     = "software-factory"
}

variable "github_app_id" {
  description = "GitHub App Client ID (Iv...) or numeric App ID, from the App settings page. Used as the JWT issuer; GitHub recommends the Client ID."
  type        = string

  validation {
    condition     = can(regex("^([0-9]+|Iv[0-9A-Za-z._]+)$", var.github_app_id))
    error_message = "github_app_id must be the GitHub App Client ID (Iv...) or numeric App ID (set SF_GITHUB_APP_ID)."
  }
}

variable "bedrock_model_id" {
  description = "Bedrock inference profile ID for the project manager agent. Check availability in eu-west-1 with: aws bedrock list-inference-profiles --region eu-west-1"
  type        = string
  default     = "eu.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "factory_key" {
  description = "Shared GUID that callers send in the x-factory-key header. Keep it in terraform.tfvars (not committed) or the FACTORY_KEY secret."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.factory_key))
    error_message = "factory_key must be a GUID (set SF_FACTORY_KEY)."
  }
}

variable "agent_max_turns" {
  description = "Most model turns per repository run"
  type        = number
  default     = 25
}

variable "max_new_issues" {
  description = "Most new issues the agent may create per repository run"
  type        = number
  default     = 25
}

variable "github_app_secret_name" {
  description = "Secrets Manager name holding the GitHub App private key (PEM). The value is set outside Terraform."
  type        = string
  default     = "software-factory/github-app-private-key"
}

