# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Terraform Outputs
# ═══════════════════════════════════════════════════════════════════════════════
# Expose infrastructure endpoints and connection strings for operational use.
#
# NOTE: These outputs contain NO secrets — only URLs, IDs, and public metadata.
# Secret values (DB passwords, API keys) are stored in Fly secrets only.
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# Application Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

output "app_name" {
  description = "Fly.io application name"
  value       = fly_app.main.name
}

output "app_url" {
  description = "Primary public URL of the application"
  value       = "https://${fly_app.main.name}.fly.dev"
}

output "app_hostname" {
  description = "Application hostname"
  value       = "${fly_app.main.name}.fly.dev"
}

output "primary_region" {
  description = "Primary deployment region"
  value       = var.primary_region
}

output "secondary_region" {
  description = "Secondary/DR region"
  value       = var.secondary_region
}

output "environment" {
  description = "Current environment"
  value       = var.environment
}

output "public_ipv4" {
  description = "Public IPv4 address for DNS configuration"
  value       = fly_ip.public_v4.address
}

output "public_ipv6" {
  description = "Public IPv6 address for DNS configuration"
  value       = fly_ip.public_v6.address
}

# ═══════════════════════════════════════════════════════════════════════════════
# Process Groups
# ═══════════════════════════════════════════════════════════════════════════════

output "process_groups" {
  description = "Configured process groups and their specs"
  value = {
    app = {
      command    = "uvicorn app.main:app --host 0.0.0.0 --port 8080 --app-dir apps/api"
      vm_size    = var.app_vm_size
      memory_mb  = var.app_vm_memory
      cpus       = var.app_vm_cpus
      instances  = var.app_instance_count
      auto_stop  = var.auto_stop_machines
      auto_start = var.auto_start_machines
    }
    qeeg_worker = {
      command   = "celery -A app.jobs worker --loglevel=INFO --without-gossip --without-mingle"
      vm_size   = var.worker_vm_size
      memory_mb = var.worker_vm_memory
      cpus      = var.worker_vm_cpus
      instances = var.qeeg_worker_count
    }
    stripe_worker = {
      command   = "retry_stripe_webhooks.py (every 5 min)"
      vm_size   = var.worker_vm_size
      memory_mb = var.worker_vm_memory
      cpus      = var.worker_vm_cpus
      instances = var.stripe_worker_count
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Database — PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════════

output "postgres_cluster_id" {
  description = "PostgreSQL cluster identifier"
  value       = fly_postgres_cluster.main.id
}

output "postgres_cluster_name" {
  description = "PostgreSQL cluster name"
  value       = fly_postgres_cluster.main.name
}

output "postgres_endpoint" {
  description = "PostgreSQL cluster internal endpoint (private networking)"
  value       = "${fly_postgres_cluster.main.name}.flycast"
}

output "postgres_database_name" {
  description = "Application database name"
  value       = "deepsynaps_${var.environment}"
}

output "postgres_connection_string_template" {
  description = "PostgreSQL connection string template (substitute credentials from secrets)"
  value       = "postgresql://<USERNAME>:<PASSWORD>@${fly_postgres_cluster.main.name}.flycast:5432/deepsynaps_${var.environment}?sslmode=${var.postgres_ssl_mode}"
  sensitive   = false
}

output "postgres_replica_count" {
  description = "Number of configured read replicas"
  value       = var.postgres_replica_count
}

output "postgres_backup_retention" {
  description = "PostgreSQL backup retention period in days"
  value       = var.postgres_backup_retention
}

output "postgres_pgvector_enabled" {
  description = "Whether pgvector extension is enabled for MedRAG"
  value       = var.postgres_pgvector_enabled
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cache — Redis
# ═══════════════════════════════════════════════════════════════════════════════

output "redis_instance_id" {
  description = "Redis instance identifier"
  value       = fly_machine.redis[0].id
}

output "redis_endpoint" {
  description = "Redis internal endpoint"
  value       = "redis://default:<PASSWORD>@${local.app_name_full}-redis.internal:6379/0"
  sensitive   = true
}

output "redis_connection_string_template" {
  description = "Redis connection string template"
  value       = "redis://default:<PASSWORD>@${local.app_name_full}-redis.internal:6379/0"
  sensitive   = false
}

output "redis_eviction_policy" {
  description = "Configured Redis eviction policy"
  value       = var.redis_eviction_policy
}

# ═══════════════════════════════════════════════════════════════════════════════
# Storage — Persistent Volume
# ═══════════════════════════════════════════════════════════════════════════════

output "volume_id" {
  description = "Persistent volume ID"
  value       = fly_volume.data.id
}

output "volume_name" {
  description = "Persistent volume name"
  value       = fly_volume.data.name
}

output "volume_size_gb" {
  description = "Volume size in GB"
  value       = var.volume_size
}

output "volume_mount_path" {
  description = "Mount path inside containers"
  value       = "/data"
}

output "volume_regions" {
  description = "Regions where the volume is available"
  value       = [var.primary_region]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Health Checks
# ═══════════════════════════════════════════════════════════════════════════════

output "health_check_url" {
  description = "URL for health check endpoint"
  value       = "https://${fly_app.main.name}.fly.dev${var.health_check_path}"
}

output "health_check_config" {
  description = "Health check configuration"
  value = {
    path         = var.health_check_path
    interval     = var.health_check_interval
    timeout      = var.health_check_timeout
    grace_period = var.health_check_grace_period
    protocol     = "HTTPS"
    port         = 443
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Backup Configuration
# ═══════════════════════════════════════════════════════════════════════════════

output "backup_config" {
  description = "Automated backup configuration summary"
  value = {
    enabled           = var.backup_enabled
    schedule          = local.is_production ? "*/15 * * * *" : var.backup_schedule
    retention_days    = var.backup_retention_days
    s3_bucket         = var.backup_s3_bucket
    s3_region         = var.backup_s3_region
    s3_endpoint       = var.backup_s3_endpoint
    encryption        = "AES-256-GCM (client-side)"
    compression       = "zstd"
  }
}

output "backup_verification_url" {
  description = "URL to check latest backup verification status"
  value       = "https://${fly_app.main.name}.fly.dev/admin/backups/status"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Maintenance Window
# ═══════════════════════════════════════════════════════════════════════════════

output "maintenance_window" {
  description = "Configured maintenance window (UTC)"
  value = {
    start    = var.maintenance_window_start
    end      = var.maintenance_window_end
    timezone = var.maintenance_timezone
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring
# ═══════════════════════════════════════════════════════════════════════════════

output "monitoring_endpoints" {
  description = "Monitoring and observability endpoints"
  value = {
    fly_dashboard   = "https://fly.io/apps/${fly_app.main.name}"
    fly_metrics     = "https://fly.io/apps/${fly_app.main.name}/metrics"
    fly_logs        = "https://fly.io/apps/${fly_app.main.name}/logs"
    health_endpoint = "https://${fly_app.main.name}.fly.dev/health"
    sentry_project  = var.sentry_dsn != "" ? "https://sentry.io/organizations/deepsynaps/projects/${fly_app.main.name}/" : "(Sentry not configured)"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cost Estimate
# ═══════════════════════════════════════════════════════════════════════════════

output "estimated_monthly_cost_usd" {
  description = "Estimated monthly infrastructure cost (USD)"
  value       = local.estimated_monthly_cost
}

# ═══════════════════════════════════════════════════════════════════════════════
# Disaster Recovery
# ═══════════════════════════════════════════════════════════════════════════════

output "dr_config" {
  description = "Disaster recovery configuration summary"
  value = {
    rpo_minutes              = 15
    rto_minutes              = 60
    secondary_region         = var.secondary_region
    standby_instance_enabled = local.is_production
    backup_retention_days    = var.backup_retention_days
    last_backup_url          = "s3://${var.backup_s3_bucket}/${local.app_name_full}/backups/latest/"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Secrets Status
# ═══════════════════════════════════════════════════════════════════════════════

output "configured_secrets" {
  description = "List of secrets configured in Fly (names only, not values)"
  value       = keys(fly_secret.app_secrets)
  sensitive   = false
}

output "secrets_documentation" {
  description = "Documentation for required secrets"
  value = {
    DEEPSYNAPS_DATABASE_URL  = "PostgreSQL connection string (auto-set if using Fly Postgres)"
    DEEPSYNAPS_SECRETS_KEY   = "Fernet key for encrypting persisted 2FA/TOTP secrets"
    JWT_SECRET_KEY           = "Secret key for JWT token signing (min 32 chars, generate with openssl rand -hex 32)"
    CELERY_BROKER_URL        = "Redis broker URL for Celery (auto-set if using Fly Redis)"
    STRIPE_SECRET_KEY        = "Stripe secret key for payment processing"
    STRIPE_WEBHOOK_SECRET    = "Stripe webhook signing secret"
    SENTRY_DSN               = "Sentry DSN for error tracking (optional)"
    BACKUP_ENCRYPTION_KEY    = "Key for encrypting database backups"
    WEARABLE_TOKEN_ENC_KEY   = "Fernet key for wearable OAuth token encryption"
    ANTHROPIC_API_KEY        = "Anthropic API key for AI features"
    OPENAI_API_KEY           = "OpenAI API key for Whisper transcription"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Operational Notes
# ═══════════════════════════════════════════════════════════════════════════════

output "operational_notes" {
  description = "Important operational notes"
  value = {
    deploy_command     = "fly deploy --config apps/api/fly.toml --app ${fly_app.main.name}"
    ssh_command        = "fly ssh console --app ${fly_app.main.name}"
    logs_command       = "fly logs --app ${fly_app.main.name}"
    db_connect_command = "fly postgres connect --app ${fly_postgres_cluster.main.name}"
    db_backup_command  = "fly postgres backup create --app ${fly_postgres_cluster.main.name}"
    scale_command      = "fly scale count ${var.app_instance_count} --app ${fly_app.main.name}"
    secrets_list       = "fly secrets list --app ${fly_app.main.name}"
  }
}
