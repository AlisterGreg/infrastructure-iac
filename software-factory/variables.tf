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
  description = "Numeric ID of the GitHub App (shown on the App's settings page)"
  type        = string
}

variable "project_owner" {
  description = "Login of the user or organisation that owns the Projects v2 board"
  type        = string
  default     = "AlisterGreg"
}

variable "project_number" {
  description = "Number of the Projects v2 board (the number in its URL)"
  type        = number
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

variable "app_source_dir" {
  description = "Path to the software-factory application's src directory, relative to this folder. CI checks the app repo out next to this one; locally it is a sibling clone."
  type        = string
  default     = "../../software-factory/src"
}
