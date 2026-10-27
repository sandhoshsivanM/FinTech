output "amqps_endpoint" {
  value = aws_mq_broker.this.instances[0].endpoints[0]
}

output "secret_arn" {
  description = "Secrets Manager secret with the application username and password."
  value       = aws_secretsmanager_secret.app.arn
}

output "url_secret_arn" {
  description = "Secrets Manager secret holding the full amqps:// URL."
  value       = aws_secretsmanager_secret.url.arn
}
