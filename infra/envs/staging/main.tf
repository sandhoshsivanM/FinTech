# Staging: the whole online platform in one account, sized small. Production is
# the same modules with larger values and multi-AZ switched on.

locals {
  name = "khazana-staging"

  # Image name (as pushed by release-backend.yml) to port. All run on 8080.
  services = [
    "gateway",
    "identity",
    "devices",
    "sync",
    "notification",
    "catalog",
    "marketdata",
    "auditreporting",
    "admin",
  ]
}

module "kms" {
  source = "../../modules/kms"
  name   = local.name
}

module "network" {
  source = "../../modules/network"
  name   = local.name
}

module "ecr" {
  source       = "../../modules/ecr"
  name         = "khazana"
  repositories = local.services
  kms_key_arn  = module.kms.key_arn
}

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Attached to every service task. The database and broker admit this group and
# nothing else, which avoids a dependency loop between them and the services.
resource "aws_security_group" "workloads" {
  name_prefix = "${local.name}-workloads-"
  description = "Khazana service tasks that may reach Postgres and RabbitMQ"
  vpc_id      = module.network.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

module "postgres" {
  source                     = "../../modules/postgres"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  kms_key_arn                = module.kms.key_arn
  allowed_security_group_ids = [aws_security_group.workloads.id]
  deletion_protection        = false
}

module "rabbitmq" {
  source                     = "../../modules/rabbitmq"
  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  kms_key_arn                = module.kms.key_arn
  allowed_security_group_ids = [aws_security_group.workloads.id]
  instance_type              = "mq.t3.micro"
}

module "service" {
  for_each = toset(local.services)
  source   = "../../modules/service"

  name          = each.key
  image         = "${module.ecr.repository_urls[each.key]}:${var.image_tag}"
  cluster_arn   = aws_ecs_cluster.this.arn
  vpc_id        = module.network.vpc_id
  subnet_ids    = module.network.private_subnet_ids
  kms_key_arn   = module.kms.key_arn
  desired_count = var.desired_count

  extra_security_group_ids = [aws_security_group.workloads.id]

  environment = {
    ASPNETCORE_URLS        = "http://+:8080"
    ASPNETCORE_ENVIRONMENT = "Production"
  }

  secrets = {
    "ConnectionStrings__rabbitmq" = module.rabbitmq.url_secret_arn
  }
}
