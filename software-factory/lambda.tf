locals {
  github_env = {
    GITHUB_APP_ID                = var.github_app_id
    GITHUB_PRIVATE_KEY_SECRET_ID = aws_secretsmanager_secret.github_app_key.name
  }
}

resource "aws_cloudwatch_log_group" "start" {
  name              = "/aws/lambda/${local.name}-start"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "project_manager" {
  name              = "/aws/lambda/${local.name}-project-manager"
  retention_in_days = 30
}

resource "aws_lambda_function" "start" {
  function_name    = "${local.name}-start"
  role             = aws_iam_role.start.arn
  runtime          = "nodejs22.x"
  handler          = "handler-start.handler"
  filename         = data.archive_file.src.output_path
  source_code_hash = data.archive_file.src.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = merge(local.github_env, {
      FACTORY_KEY                   = var.factory_key
      PROJECT_MANAGER_FUNCTION_NAME = "${local.name}-project-manager"
    })
  }

  depends_on = [aws_cloudwatch_log_group.start]
}

resource "aws_lambda_function" "project_manager" {
  function_name    = "${local.name}-project-manager"
  role             = aws_iam_role.project_manager.arn
  runtime          = "nodejs22.x"
  handler          = "handler-project-manager.handler"
  filename         = data.archive_file.src.output_path
  source_code_hash = data.archive_file.src.output_base64sha256
  timeout          = 900
  memory_size      = 512

  environment {
    variables = merge(local.github_env, {
      BEDROCK_MODEL_ID = var.bedrock_model_id
      AGENT_MAX_TURNS  = tostring(var.agent_max_turns)
      MAX_NEW_ISSUES   = tostring(var.max_new_issues)
    })
  }

  depends_on = [aws_cloudwatch_log_group.project_manager]
}

# A failed repository run is not retried automatically: the next run reconciles from GitHub,
# so a retry would only repeat work.
resource "aws_lambda_function_event_invoke_config" "project_manager" {
  function_name          = aws_lambda_function.project_manager.function_name
  maximum_retry_attempts = 0
}
