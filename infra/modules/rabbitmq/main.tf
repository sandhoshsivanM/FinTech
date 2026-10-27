# Amazon MQ for RabbitMQ, private, encrypted with the platform key. The
# application password is generated here and stored in Secrets Manager; the
# services read it from there at start-up.

resource "random_password" "app" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name       = "${var.name}/rabbitmq/app"
  kms_key_id = var.kms_key_arn
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    username = "khazana"
    password = random_password.app.result
  })
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-mq-"
  description = "RabbitMQ for ${var.name}"
  vpc_id      = var.vpc_id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "amqps" {
  for_each                     = toset(var.allowed_security_group_ids)
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5671
  to_port                      = 5671
}

resource "aws_mq_broker" "this" {
  broker_name                = var.name
  engine_type                = "RabbitMQ"
  engine_version             = var.engine_version
  host_instance_type         = var.instance_type
  deployment_mode            = var.cluster ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"
  publicly_accessible        = false
  auto_minor_version_upgrade = true
  subnet_ids                 = var.cluster ? var.subnet_ids : [var.subnet_ids[0]]
  security_groups            = [aws_security_group.this.id]

  encryption_options {
    kms_key_id        = var.kms_key_arn
    use_aws_owned_key = false
  }

  user {
    username = "khazana"
    password = random_password.app.result
  }

  logs {
    general = true
  }
}

# The URL the services read (ConnectionStrings__rabbitmq). Built from the
# broker's real endpoint, so it exists only once the broker does.
resource "aws_secretsmanager_secret" "url" {
  name       = "${var.name}/rabbitmq/url"
  kms_key_id = var.kms_key_arn
}

resource "aws_secretsmanager_secret_version" "url" {
  secret_id = aws_secretsmanager_secret.url.id
  secret_string = format(
    "amqps://khazana:%s@%s",
    random_password.app.result,
    trimprefix(aws_mq_broker.this.instances[0].endpoints[0], "amqps://"),
  )
}
