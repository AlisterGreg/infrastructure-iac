output "run_url" {
  description = "POST here with the x-factory-key header to start a run"
  value       = "${aws_apigatewayv2_api.factory.api_endpoint}/runs"
}

output "github_app_secret_name" {
  description = "Set the App's private key here: aws secretsmanager put-secret-value --secret-id <name> --secret-string file://key.pem"
  value       = aws_secretsmanager_secret.github_app_key.name
}

output "start_function" {
  value = aws_lambda_function.start.function_name
}

output "project_manager_function" {
  value = aws_lambda_function.project_manager.function_name
}
