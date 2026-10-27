output "repository_urls" {
  description = "Where release-backend.yml-built images are pushed for this environment."
  value       = module.ecr.repository_urls
}

output "postgres_address" {
  value = module.postgres.address
}

output "rabbitmq_endpoint" {
  value = module.rabbitmq.amqps_endpoint
}
