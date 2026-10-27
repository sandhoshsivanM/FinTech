variable "region" {
  description = "AWS region. Mumbai keeps the data in India."
  type        = string
  default     = "ap-south-1"
}

variable "image_tag" {
  description = "Release version to run (the online-vX.Y.Z tag without the prefix)."
  type        = string
}

variable "desired_count" {
  description = "Tasks per service."
  type        = number
  default     = 1
}
