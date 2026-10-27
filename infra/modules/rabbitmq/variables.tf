variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets. A single instance uses the first."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to connect on 5671 (AMQPS)."
  type        = list(string)
  default     = []
}

variable "kms_key_arn" {
  type = string
}

variable "engine_version" {
  type    = string
  default = "3.13"
}

variable "instance_type" {
  type    = string
  default = "mq.m5.large"
}

variable "cluster" {
  description = "Three-node multi-AZ cluster instead of a single instance."
  type        = bool
  default     = false
}
