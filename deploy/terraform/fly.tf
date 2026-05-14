# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Fly.io-Specific Resources
# ═══════════════════════════════════════════════════════════════════════════════
# Defines all Fly.io resources: app, machines, postgres, redis, volumes,
# secrets, and health checks.
#
# This file is intentionally separated to isolate Fly-provider-specific
# resources from generic infrastructure concerns.
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# Application — fly_app
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_app" "main" {
  name = local.app_name_full
  org  = var.fly_org

  lifecycle {
    prevent_destroy = true
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# PostgreSQL Cluster — fly_postgres_cluster
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_postgres_cluster" "main" {
  name       = local.postgres_name
  app        = fly_app.main.name
  region     = var.primary_region
  org        = var.fly_org
  image_ref  = "flyio/postgres-flex:${var.postgres_version}"
  vm_size    = var.postgres_vm_size
  volume_size = var.postgres_disk_size

  # High availability: 1 primary + replica_count read replicas
  count = var.postgres_replica_count + 1  # +1 for primary

  # Enable automatic backups
  automatic_backup = var.postgres_backup_enabled
  backup_retention = var.postgres_backup_retention

  # PostgreSQL configuration for clinical workload
  postgres_configuration = {
    max_connections                   = "200"
    shared_buffers                    = "512MB"
    effective_cache_size              = "1536MB"
    maintenance_work_mem              = "128MB"
    checkpoint_completion_target      = "0.9"
    wal_buffers                       = "16MB"
    default_statistics_target         = "100"
    random_page_cost                  = "1.1"  # SSD storage
    effective_io_concurrency          = "200"
    work_mem                          = "10MB"
    min_wal_size                      = "1GB"
    max_wal_size                      = "4GB"
    log_statement                     = local.is_production ? "mod" : "all"
    log_min_duration_statement        = local.is_production ? "1000" : "100"
    log_connections                   = "on"
    log_disconnections                = "on"
    log_checkpoints                   = "on"
    log_lock_waits                    = "on"
    track_functions                   = "all"
    track_activity_query_size         = "4096"
    auto_explain.log_min_duration     = "5000"
    auto_explain.log_analyze          = "on"
  }

  # Enable pgvector extension via initialization script
  provisioning_script = <<-EOF
    #!/bin/bash
    set -euo pipefail

    echo "=== DeepSynaps PostgreSQL Provisioning ==="

    # Create application database
    psql -U postgres -c "CREATE DATABASE IF NOT EXISTS deepsynaps_${var.environment};" || true

    # Create application user (read/write)
    psql -U postgres -c "CREATE USER IF NOT EXISTS deepsynaps_app WITH PASSWORD '${random_password.db_app_password.result}';" || true

    psql -U postgres -c "\c deepsynaps_${var.environment}" -c "
      GRANT ALL PRIVILEGES ON DATABASE deepsynaps_${var.environment} TO deepsynaps_app;
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO deepsynaps_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO deepsynaps_app;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO deepsynaps_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO deepsynaps_app;
    " || true

    # Enable required extensions
    psql -U postgres -d "deepsynaps_${var.environment}" -c "CREATE EXTENSION IF NOT EXISTS pgvector;" || true
    psql -U postgres -d "deepsynaps_${var.environment}" -c "CREATE EXTENSION IF NOT EXISTS 'uuid-ossp';" || true
    psql -U postgres -d "deepsynaps_${var.environment}" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" || true

    # Configure WAL archiving for point-in-time recovery
    psql -U postgres -c "ALTER SYSTEM SET archive_mode = 'on';" || true
    psql -U postgres -c "ALTER SYSTEM SET archive_command = 'wal-g wal-push %p';" || true
    psql -U postgres -c "SELECT pg_reload_conf();" || true

    echo "=== Provisioning complete ==="
  EOF

  depends_on = [fly_app.main]

  lifecycle {
    prevent_destroy = local.is_production
  }
}

locals {
  postgres_name = var.postgres_name != "" ? var.postgres_name : "${local.app_name_full}-db"
  redis_name    = var.redis_name != "" ? var.redis_name : "${local.app_name_full}-redis"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Redis Instance (Upstash or self-hosted via fly_machine)
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machine" "redis" {
  count = var.redis_replicas == 0 ? 1 : 1  # Single instance; scaling handled separately

  app    = fly_app.main.name
  name   = "${local.redis_name}-1"
  region = var.primary_region
  size   = "shared-cpu-1x"

  config {
    image = "flyio/redis:7"
    cpus  = 1
    memory = 512

    env = {
      REDIS_PASSWORD = random_password.redis_password.result
      REDIS_MAXMEMORY_POLICY = var.redis_eviction_policy
    }

    services {
      ports {
        port     = 6379
        handlers = []
      }
      protocol      = "tcp"
      internal_port = 6379

      # Redis health check
      checks {
        type     = "tcp"
        port     = 6379
        interval = "15s"
        timeout  = "5s"
      }
    }
  }

  depends_on = [fly_app.main]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Persistent Volume — fly_volume
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_volume" "data" {
  app    = fly_app.main.name
  name   = var.volume_name
  region = var.primary_region
  size   = var.volume_size

  # Enable automated snapshots for DR
  snapshot_retention = min(var.backup_retention_days, 30)

  depends_on = [fly_app.main]

  lifecycle {
    prevent_destroy = true
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Application Secrets — fly_secret
# ═══════════════════════════════════════════════════════════════════════════════
# All secrets are managed externally — this documents the required set.
# Values are injected via CI/CD or manual `fly secrets set`.
# Terraform only creates placeholder entries that are immediately overridden.

resource "fly_secret" "app_secrets" {
  for_each = merge(
    # Secrets that Terraform generates
    local.is_production ? {
      BACKUP_ENCRYPTION_KEY = random_id.backup_encryption_key.hex
      REDIS_PASSWORD        = random_password.redis_password.result
    } : {},
    # Secrets passed as variables ( Terraform does NOT store these in state )
    var.database_url != "" ? {
      DEEPSYNAPS_DATABASE_URL = var.database_url
    } : {},
    var.celery_broker_url != "" ? {
      CELERY_BROKER_URL     = var.celery_broker_url
      CELERY_RESULT_BACKEND = var.celery_broker_url
    } : {},
    var.jwt_secret_key != "" ? {
      JWT_SECRET_KEY = var.jwt_secret_key
    } : {},
    var.secrets_key != "" ? {
      DEEPSYNAPS_SECRETS_KEY = var.secrets_key
    } : {},
    var.sentry_dsn != "" ? {
      SENTRY_DSN = var.sentry_dsn
    } : {},
    var.stripe_secret_key != "" ? {
      STRIPE_SECRET_KEY     = var.stripe_secret_key
      STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
    } : {},
    # Environment-specific configuration (non-sensitive)
    {
      DEEPSYNAPS_APP_ENV         = var.environment == "production" ? "production" : "staging"
      DEEPSYNAPS_API_HOST        = "0.0.0.0"
      DEEPSYNAPS_API_PORT        = "8080"
      DEEPSYNAPS_LOG_LEVEL       = local.is_production ? "INFO" : "DEBUG"
      PORT                       = "8080"
      MRI_DEMO_MODE              = tostring(var.mri_demo_mode)
      WHISPER_MODEL              = var.whisper_model
      DEEPSYNAPS_VOICE_WARMUP    = "1"
      DEEPSYNAPS_VOICE_DIR       = "/data/voice"
      EVIDENCE_DB_PATH           = "/data/evidence.db"
    }
  )

  app  = fly_app.main.name
  name = each.key

  # NOTE: Values are only set on initial creation. After that, use:
  #   fly secrets set KEY=value --app <app_name>
  # to update. Terraform will not overwrite manually-set secrets.
  lifecycle {
    ignore_changes = [
      # Prevent Terraform from overwriting secrets managed externally
      value,
    ]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# App Machine — HTTP server (fly_machine)
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machine" "app" {
  count = var.app_instance_count

  app    = fly_app.main.name
  name   = "${local.app_name_full}-app-${count.index + 1}"
  region = var.primary_region
  size   = var.app_vm_size

  config {
    image  = var.docker_image != "" ? var.docker_image : "registry.fly.io/${local.app_name_full}:latest"
    cpus   = var.app_vm_cpus
    memory = var.app_vm_memory

    env = {
      DEEPSYNAPS_APP_ENV      = var.environment == "production" ? "production" : "staging"
      DEEPSYNAPS_API_HOST     = "0.0.0.0"
      DEEPSYNAPS_API_PORT     = "8080"
      DEEPSYNAPS_LOG_LEVEL    = local.is_production ? "INFO" : "DEBUG"
      PORT                    = "8080"
      EVIDENCE_DB_PATH        = "/data/evidence.db"
      DEEPSYNAPS_VOICE_DIR    = "/data/voice"
      WHISPER_MODEL           = var.whisper_model
      DEEPSYNAPS_VOICE_WARMUP = "1"
      MRI_DEMO_MODE           = tostring(var.mri_demo_mode)
      # CORS origins set via secret for security
      # DEEPSYNAPS_CORS_ORIGINS set via fly secrets
    }

    services {
      ports {
        port     = 80
        handlers = ["http"]
      }
      ports {
        port     = 443
        handlers = ["tls", "http"]
      }
      protocol      = "tcp"
      internal_port = 8080

      # Concurrency limits
      concurrency {
        type       = var.concurrency_type
        soft_limit = var.concurrency_soft_limit
        hard_limit = var.concurrency_hard_limit
      }

      # HTTP health check
      checks {
        type         = "http"
        port         = 8080
        path         = var.health_check_path
        interval     = var.health_check_interval
        timeout      = var.health_check_timeout
        grace_period = var.health_check_grace_period
        method       = "GET"
      }
    }

    mounts {
      volume = fly_volume.data.id
      path   = "/data"
    }

    # Release command runs database migrations
    release_command = "sh -c 'cd /app/apps/api && python -m alembic upgrade head'"
  }

  depends_on = [fly_app.main, fly_volume.data]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [config[0].env["DEEPSYNAPS_DATABASE_URL"], config[0].env["DEEPSYNAPS_CORS_ORIGINS"]]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Worker Machines — fly_machine (qeeg_worker, stripe_worker)
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machine" "worker" {
  count = var.qeeg_worker_count + var.stripe_worker_count

  app    = fly_app.main.name
  name   = count.index < var.qeeg_worker_count ? "${local.app_name_full}-qeeg-${count.index + 1}" : "${local.app_name_full}-stripe-${count.index - var.qeeg_worker_count + 1}"
  region = var.primary_region
  size   = var.worker_vm_size

  config {
    image  = var.docker_image != "" ? var.docker_image : "registry.fly.io/${local.app_name_full}:latest"
    cpus   = var.worker_vm_cpus
    memory = var.worker_vm_memory

    env = {
      DEEPSYNAPS_APP_ENV   = var.environment == "production" ? "production" : "staging"
      DEEPSYNAPS_LOG_LEVEL = local.is_production ? "INFO" : "DEBUG"
      # Workers need Celery broker URL — set via secrets
      EVIDENCE_DB_PATH     = "/data/evidence.db"
    }

    mounts {
      volume = fly_volume.data.id
      path   = "/data"
    }
  }

  depends_on = [fly_app.main, fly_volume.data]

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [config[0].env["CELERY_BROKER_URL"], config[0].env["CELERY_RESULT_BACKEND"]]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Auto-scaling Configuration (via fly_autoscaling or manual count)
# ═══════════════════════════════════════════════════════════════════════════════

# Note: Fly.io machine auto-scaling is configured through the fly.toml or
# API. For now, machine counts are managed explicitly via variables.
# Future enhancement: use fly_autoscaling resource when available.

# ═══════════════════════════════════════════════════════════════════════════════
# Certificate — HTTPS/TLS
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_cert" "main" {
  count = var.custom_domain != "" ? 1 : 0

  app    = fly_app.main.name
  domain = var.custom_domain

  depends_on = [fly_app.main]
}

# ─────────────────────────────────────────────────────────────────────────────
# Additional variables needed for this file
# ─────────────────────────────────────────────────────────────────────────────

variable "fly_org" {
  description = "Fly.io organization slug"
  type        = string
  default     = "personal"
}

variable "custom_domain" {
  description = "Custom domain for the application (empty to use .fly.dev)"
  type        = string
  default     = ""
}
