resource "aws_apigatewayv2_api" "factory" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "start" {
  api_id                 = aws_apigatewayv2_api.factory.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.start.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "runs" {
  api_id    = aws_apigatewayv2_api.factory.id
  route_key = "POST /runs"
  target    = "integrations/${aws_apigatewayv2_integration.start.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.factory.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 5
    throttling_rate_limit  = 2
  }
}

resource "aws_lambda_permission" "api_invoke_start" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.factory.execution_arn}/*/*"
}
