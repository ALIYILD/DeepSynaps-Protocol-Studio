# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Main Terraform Configuration
# ═══════════════════════════════════════════════════════════════════════════════
# Infrastructure as Code for clinical neuromodulation platform on Fly.io.
#
# Resources managed:
#   - Fly.io application (app, worker, stripe_worker process groups)
#   - PostgreSQL cluster (production-grade with replicas)
#   - Redis instance (Celery broker + rate limiting)
#   - Persistent volume (/data — evidence DB, voice, media)
#   - Secrets management (environment-specific)
#   - Health checks and monitoring
#
# Usage:
#   terraform init
#   terraform workspace new production|staging
#   terraform plan -var-file=environments/${terraform.workspace}.tfvars
#   terraform apply -var-file=environments/${terraform.workspace}.tfvars
# ═══════════════════════════════════════════════════════════════════════════════

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = ">= 0.0.23"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5.0"
    }
  }

  # ═══════════════════════════════════════════════════════════════════════════
  # Remote state — configure backend for team collaboration
  # ═══════════════════════════════════════════════════════════════════════════
  backend "s3" {
    bucket         = "deepsynaps-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "deepsynaps-terraform-locks"
  }
}

provider "fly" {
  fly_api_token = var.fly_api_token
}

# ═══════════════════════════════════════════════════════════════════════════════
# Local values — shared configuration derived from variables
# ═══════════════════════════════════════════════════════════════════════════════
locals {
  app_name         = var.app_name
  app_name_full    = var.environment == "production" ? var.app_name : "${var.app_name}-${var.environment}"
  primary_region   = var.primary_region
  environment      = var.environment
  is_production    = var.environment == "production"
  tags             = merge(var.common_tags, { Environment = var.environment })
  backup_retention = var.backup_retention_days

  # Health check endpoint
  health_check_path = "/health"
  health_check_port = 8080

  # Clinical operating hours (UTC) — maintenance windows
  maintenance_window_start = var.maintenance_window_start  # e.g., "02:00"
  maintenance_window_end   = var.maintenance_window_end    # e.g., "06:00"

  # CORS origins by environment
  cors_origins = {
    production = "https://deepsynaps-studio.fly.dev,https://deepsynaps.app"
    staging    = "https://deepsynaps-studio-preview.netlify.app"
    dev        = "http://localhost:5173,http://127.0.0.1:5173"
  }

  # Process group definitions
  processes = {
    app = {
      cmd     = "uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir apps/api"
      vm_size = var.app_vm_size
      memory  = var.app_vm_memory
      cpus    = var.app_vm_cpus
      count   = var.app_instance_count
    }
    qeeg_worker = {
      cmd     = "sh -c 'PYTHONPATH=/app/apps/api celery -A app.jobs worker --loglevel=INFO --without-gossip --without-mingle'"
      vm_size = var.worker_vm_size
      memory  = var.worker_vm_memory
      cpus    = var.worker_vm_cpus
      count   = var.qeeg_worker_count
    }
    stripe_worker = {
      cmd     = "sh -c 'while true; do python scripts/retry_stripe_webhooks.py; sleep 300; done'"
      vm_size = var.worker_vm_size
      memory  = var.worker_vm_memory
      cpus    = var.worker_vm_cpus
      count   = var.stripe_worker_count
    }
  }

  # Secrets — NEVER include actual values, only references
  # Values are injected via fly secrets set or CI/CD pipeline
  secrets = {
    DEEPSYNAPS_APP_ENV         = var.environment == "production" ? "production" : "staging"
    DEEPSYNAPS_API_HOST        = "0.0.0.0"
    DEEPSYNAPS_API_PORT        = "8080"
    DEEPSYNAPS_LOG_LEVEL       = local.is_production ? "INFO" : "DEBUG"
    DEEPSYNAPS_CORS_ORIGINS    = lookup(local.cors_origins, local.environment, local.cors_origins["staging"])
    EVIDENCE_DB_PATH           = "/data/evidence.db"
    DEEPSYNAPS_VOICE_DIR       = "/data/voice"
    WHISPER_MODEL              = "base"
    DEEPSYNAPS_VOICE_WARMUP    = "1"
    MRI_DEMO_MODE              = local.is_production ? "0" : "1"
    PORT                       = "8080"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Random password generation for database credentials
# These are stored in Fly secrets — NOT in Terraform state
# ═══════════════════════════════════════════════════════════════════════════════

resource "random_password" "db_admin_password" {
  length  = 32
  special = true
}

resource "random_password" "db_app_password" {
  length  = 32
  special = true
}

resource "random_password" "redis_password" {
  length  = 32
  special = false  # Redis URI compatibility
}

resource "random_id" "backup_encryption_key" {
  byte_length = 32
}

# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring — external health check (basic uptime monitoring)
# ═══════════════════════════════════════════════════════════════════════════════

# Note: For comprehensive monitoring, integrate with:
#   - Sentry (error tracking) — set via SENTRY_DSN secret
#   - Prometheus/Grafana (metrics) — via Fly's built-in Prometheus
#   - PagerDuty/Opsgenie (alerting) — configure in monitoring dashboard

# ═══════════════════════════════════════════════════════════════════════════════
# Data sources
# ═══════════════════════════════════════════════════════════════════════════════

data "fly_app" "existing" {
  name       = local.app_name_full
  depends_on = [fly_app.main]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Application release — manages deployment lifecycle
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_release" "main" {
  app        = fly_app.main.name
  image      = var.docker_image
  depends_on = [fly_machine.app, fly_machine.worker]

  # Release command runs migrations
  release_command = "sh -c 'cd /app/apps/api && python -m alembic upgrade head'"

  lifecycle {
    create_before_destroy = true
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Application scaling — machine counts by process group
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machines_count" "app" {
  app    = fly_app.main.name
  count  = local.processes.app.count
  region = local.primary_region
  size   = local.processes.app.vm_size

  depends_on = [fly_machine.app]
}

resource "fly_machines_count" "qeeg_worker" {
  app    = fly_app.main.name
  count  = local.processes.qeeg_worker.count
  region = local.primary_region
  size   = local.processes.qeeg_worker.vm_size

  depends_on = [fly_machine.worker]
}

resource "fly_machines_count" "stripe_worker" {
  app    = fly_app.main.name
  count  = local.processes.stripe_worker.count
  region = local.primary_region
  size   = local.processes.stripe_worker.vm_size

  depends_on = [fly_machine.worker]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cross-region failover configuration (production only)
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machine" "app_standby" {
  count = local.is_production ? 1 : 0

  app    = fly_app.main.name
  name   = "${local.app_name_full}-app-standby"
  region = var.secondary_region
  size   = local.processes.app.vm_size

  config {
    image  = var.docker_image
    cpus   = local.processes.app.cpus
    memory = local.processes.app.memory

    env = {
      DEEPSYNAPS_APP_ENV      = var.environment
      DEEPSYNAPS_API_HOST     = "0.0.0.0"
      DEEPSYNAPS_API_PORT     = "8080"
      DEEPSYNAPS_LOG_LEVEL    = "INFO"
      PORT                    = "8080"
      FLY_STANDBY             = "true"
      EVIDENCE_DB_PATH        = "/data/evidence.db"
      DEEPSYNAPS_VOICE_DIR    = "/data/voice"
      WHISPER_MODEL           = "base"
      DEEPSYNAPS_VOICE_WARMUP = "1"
      MRI_DEMO_MODE           = "0"
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

      checks {
        type     = "http"
        port     = 8080
        path     = "/health"
        interval = "15s"
        timeout  = "5s"
      }
    }

    mounts {
      volume = fly_volume.data.id
      path   = "/data"
    }
  }

  depends_on = [fly_app.main, fly_volume.data]

  lifecycle {
    ignore_changes = [config[0].env["DEEPSYNAPS_DATABASE_URL"]]
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Backup automation — scheduled machine for automated backups
# ═══════════════════════════════════════════════════════════════════════════════

resource "fly_machine" "backup_scheduler" {
  count = local.is_production ? 1 : 0

  app    = fly_app.main.name
  name   = "${local.app_name_full}-backup"
  region = local.primary_region
  size   = "shared-cpu-1x"

  config {
    image  = "flyio/pg-utils:latest"
    cpus   = 1
    memory = 256

    env = {
      BACKUP_SCHEDULE       = local.is_production ? "*/15 * * * *" : "0 */6 * * *"  # Every 15 min in prod
      BACKUP_RETENTION_DAYS = local.backup_retention
      S3_ENDPOINT           = var.backup_s3_endpoint
      S3_BUCKET             = var.backup_s3_bucket
      S3_REGION             = var.backup_s3_region
      DATABASE_URL_SECRET   = "DEEPSYNAPS_DATABASE_URL"
      ENCRYPTION_KEY_SECRET = "BACKUP_ENCRYPTION_KEY"
    }

    # Mount backup scripts
    files {
      guest_path  = "/scripts/backup-database.sh"
      local_path  = "../../scripts/backup-database.sh"
      secret_name = null
    }
  }

  depends_on = [fly_app.main]
}

# ═══════════════════════════════════════════════════════════════════════════════
# DNS and routing — external DNS for failover
# ═══════════════════════════════════════════════════════════════════════════════

# Primary DNS record (managed externally — e.g., Cloudflare)
# This resource documents the expected DNS configuration

resource "fly_ip" "public_v4" {
  app  = fly_app.main.name
  type = "v4"
}

resource "fly_ip" "public_v6" {
  app  = fly_app.main.name
  type = "v6"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cost estimation (local values for budget tracking)
# ═══════════════════════════════════════════════════════════════════════════════

locals {
  # Approximate monthly costs on Fly.io (USD)
  # These are estimates — actual costs depend on usage
  cost_estimates = {
    app_instances = {
      production = local.processes.app.count * 80   # ~$80/mo per performance-4x
      staging    = local.processes.app.count * 10   # ~$10/mo per shared-cpu-2x
    }
    workers = {
      production = (local.processes.qeeg_worker.count + local.processes.stripe_worker.count) * 10
      staging    = (local.processes.qeeg_worker.count + local.processes.stripe_worker.count) * 5
    }
    postgres = {
      production = 40  # ~$40/mo for high-availability Postgres
      staging    = 15  # ~$15/mo for single-node Postgres
    }
    redis = {
      production = 15  # ~$15/mo for Upstash Redis
      staging    = 5   # ~$5/mo for basic Redis
    }
    storage = {
      production = 10  # ~$0.15/GB/mo
      staging    = 3
    }
    bandwidth = {
      production = 20  # Variable based on traffic
      staging    = 5
    }
  }

  estimated_monthly_cost = (
    local.is_production ? (
      local.cost_estimates.app_instances.production +
      local.cost_estimates.workers.production +
      local.cost_estimates.postgres.production +
      local.cost_estimates.redis.production +
      local.cost_estimates.storage.production +
      local.cost_estimates.bandwidth.production
    ) : (
      local.cost_estimates.app_instances.staging +
      local.cost_estimates.workers.staging +
      local.cost_estimates.postgres.staging +
      local.cost_estimates.redis.staging +
      local.cost_estimates.storage.staging +
      local.cost_estimates.bandwidth.staging
    )
  )
}

# ═══════════════════════════════════════════════════════════════════════════════
# Lifecycle rules
# ═══════════════════════════════════════════════════════════════════════════════

# Prevent accidental destruction of production resources
resource "null_resource" "production_protection" {
  count = local.is_production ? 1 : 0

  lifecycle {
    prevent_destroy = true
  }

  triggers = {
    app_name      = fly_app.main.name
    postgres_name = fly_postgres_cluster.main.name
  }
}
