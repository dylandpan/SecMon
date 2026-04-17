# apigateway.tf
# HTTP API Gateway that receives GitHub push webhooks and invokes the SAST Lambda.
# Webhook endpoint: POST <api_endpoint>/webhook

resource "aws_apigatewayv2_api" "sast_webhook" {
  name          = "${var.project_name}-sast-webhook"
  protocol_type = "HTTP"
  description   = "Receives GitHub push webhook events for SAST scanning"
}

resource "aws_apigatewayv2_stage" "sast_webhook" {
  api_id      = aws_apigatewayv2_api.sast_webhook.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "sast_lambda" {
  api_id                 = aws_apigatewayv2_api.sast_webhook.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sast_scanner.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "sast_webhook" {
  api_id    = aws_apigatewayv2_api.sast_webhook.id
  route_key = "POST /webhook"
  target    = "integrations/${aws_apigatewayv2_integration.sast_lambda.id}"
}

# Allow API Gateway to invoke the SAST Lambda
resource "aws_lambda_permission" "api_gateway_sast" {
  statement_id  = "AllowAPIGatewaySAST"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sast_scanner.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.sast_webhook.execution_arn}/*/*"
}
