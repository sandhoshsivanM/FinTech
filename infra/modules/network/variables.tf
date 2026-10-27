variable "name" {
  description = "Name prefix for every resource."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.20.0.0/16"
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for all private subnets (cheaper, one zone is a single point of failure)."
  type        = bool
  default     = true
}
