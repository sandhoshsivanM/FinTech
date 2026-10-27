variable "name" {
  description = "Repository namespace, e.g. khazana."
  type        = string
}

variable "repositories" {
  description = "Image names, one repository each."
  type        = list(string)
}

variable "kms_key_arn" {
  description = "Key used to encrypt the images."
  type        = string
}
