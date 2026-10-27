output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "security_group_id" {
  value = aws_security_group.this.id
}

output "master_secret_arn" {
  description = "Secrets Manager secret holding the admin credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
