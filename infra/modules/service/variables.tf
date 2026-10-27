variable "name" {
  description = "Service name, e.g. identity."
  type        = string
}

variable "image" {
  description = "Full image reference including an immutable tag."
  type        = string
}

variable "cluster_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets."
  type        = list(string)
}

variable "kms_key_arn" {
  type = string
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "environment" {
  description = "Plain configuration. Never put a secret here."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Environment variable name to Secrets Manager ARN."
  type        = map(string)
  default     = {}
}

variable "allowed_caller_security_group_ids" {
  description = "Security groups that may call this service (the gateway, other services)."
  type        = list(string)
  default     = []
}

variable "target_group_arn" {
  description = "Load balancer target group, for the gateway only."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "extra_security_group_ids" {
  description = "Additional security groups for the tasks, e.g. the one that admits them to the database and broker."
  type        = list(string)
  default     = []
}
