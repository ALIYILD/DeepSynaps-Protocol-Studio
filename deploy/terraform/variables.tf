# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Terraform Variables
# ═══════════════════════════════════════════════════════════════════════════════
# All configurable parameters for staging and production environments.
#
# Usage:
#   terraform plan -var-file=environments/production.tfvars
#   terraform plan -var-file=environments/staging.tfvars
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# General
# ─────────────────────────────────────────────────────────────────────────────

variable "app_name" {
  description = "Base application name (without environment suffix)"
  type        = string
  default     = "deepsynaps-studio"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["production", "staging", "dev"], var.environment)
    error_message = "Environment must be one of: production, staging, dev."
  }
}

variable "primary_region" {
  description = "Primary Fly.io region for deployment (https://fly.io/docs/reference/regions/)"
  type        = string
  default     = "lhr"
}

variable "secondary_region" {
  description = "Secondary region for disaster recovery failover"
  type        = string
  default     = "iad"  # US East (Virginia) — geographically distant from LHR
}

variable "fly_api_token" {
  description = "Fly.io API token for authentication. Set via FLY_API_TOKEN env var."
  type        = string
  sensitive   = true
}

variable "docker_image" {
  description = "Docker image URI for the application (e.g., registry.fly.io/deepsynaps-studio:latest)"
  type        = string
  default     = ""
}

variable "common_tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default = {
    Project     = "DeepSynaps Protocol Studio"
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA-ready"
    DataClass   = "PHI-sensitive"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# VM Configuration — App (HTTP server)
# ─────────────────────────────────────────────────────────────────────────────

variable "app_vm_size" {
  description = "Fly VM size for the app process group (performance-4x for production, shared-cpu-2x for staging)"
  type        = string
  default     = "performance-4x"
}

variable "app_vm_memory" {
  description = "Memory allocation for app VMs in MB"
  type        = number
  default     = 8192  # 8GB required for Whisper + ML models
}

variable "app_vm_cpus" {
  description = "CPU count for app VMs"
  type        = number
  default     = 4
}

variable "app_instance_count" {
  description = "Number of app instances to run"
  type        = number
  default     = 2  # Min 2 for high availability in production
}

# ─────────────────────────────────────────────────────────────────────────────
# VM Configuration — Workers (qeeg_worker, stripe_worker)
# ─────────────────────────────────────────────────────────────────────────────

variable "worker_vm_size" {
  description = "Fly VM size for worker process groups"
  type        = string
  default     = "shared-cpu-1x"
}

variable "worker_vm_memory" {
  description = "Memory allocation for worker VMs in MB"
  type        = number
  default     = 1024  # 1GB sufficient for Celery workers
}

variable "worker_vm_cpus" {
  description = "CPU count for worker VMs"
  type        = number
  default     = 1
}

variable "qeeg_worker_count" {
  description = "Number of qEEG/ERP Celery worker instances"
  type        = number
  default     = 2
}

variable "stripe_worker_count" {
  description = "Number of Stripe webhook retry worker instances"
  type        = number
  default     = 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Auto-scaling Configuration
# ─────────────────────────────────────────────────────────────────────────────

variable "auto_stop_machines" {
  description = "Whether to stop machines when idle (disable in production for constant availability)"
  type        = bool
  default     = false
}

variable "auto_start_machines" {
  description = "Whether to start machines on incoming requests"
  type        = bool
  default     = true
}

variable "min_machines_running" {
  description = "Minimum number of machines to keep running"
  type        = number
  default     = 1
}

variable "concurrency_type" {
  description = "Concurrency metric type (connections or requests)"
  type        = string
  default     = "connections"
}

variable "concurrency_soft_limit" {
  description = "Soft concurrency limit for load balancing"
  type        = number
  default     = 20
}

variable "concurrency_hard_limit" {
  description = "Hard concurrency limit — connections above this are rejected"
  type        = number
  default     = 25
}

# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL Configuration
# ─────────────────────────────────────────────────────────────────────────────

variable "postgres_name" {
  description = "Name for the PostgreSQL cluster"
  type        = string
  default     = ""
}

variable "postgres_vm_size" {
  description = "VM size for PostgreSQL nodes (performance-1x or larger for production)"
  type        = string
  default     = "performance-1x"
}

variable "postgres_vm_memory" {
  description = "Memory for PostgreSQL VMs in MB"
  type        = number
  default     = 2048
}

variable "postgres_disk_size" {
  description = "Disk size for PostgreSQL in GB"
  type        = number
  default     = 20
}

variable "postgres_replica_count" {
  description = "Number of PostgreSQL read replicas (0 for dev/staging, 1+ for production)"
  type        = number
  default     = 0
}

variable "postgres_backup_enabled" {
  description = "Enable automated PostgreSQL backups via Fly.io"
  type        = bool
  default     = true
}

variable "postgres_backup_retention" {
  description = "Number of days to retain PostgreSQL backups"
  type        = number
  default     = 30
}

variable "postgres_pgvector_enabled" {
  description = "Enable pgvector extension for MedRAG evidence retrieval"
  type        = bool
  default     = true
}

variable "postgres_version" {
  description = "PostgreSQL major version"
  type        = number
  default     = 15
}

variable "postgres_ssl_mode" {
  description = "SSL mode for database connections"
  type        = string
  default     = "require"
  validation {
    condition     = contains(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"], var.postgres_ssl_mode)
    error_message = "Invalid SSL mode."
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Redis Configuration
# ─────────────────────────────────────────────────────────────────────────────

variable "redis_name" {
  description = "Name for the Redis/Valkey instance"
  type        = string
  default     = ""
}

variable "redis_eviction_policy" {
  description = "Redis eviction policy when max memory reached"
  type        = string
  default     = "allkeys-lru"
  validation {
    condition     = contains(["noeviction", "allkeys-lru", "volatile-lru", "allkeys-random", "volatile-random", "volatile-ttl"], var.redis_eviction_policy)
    error_message = "Invalid Redis eviction policy."
  }
}

variable "redis_memory_size" {
  description = "Redis instance memory size (for managed Upstash Redis)"
  type        = string
  default     = "512mb"
}

variable "redis_replicas" {
  description = "Number of Redis read replicas"
  type        = number
  default     = 0
}

# ─────────────────═════════════════════════════════════════════════════════════
# Persistent Volume (/data — evidence DB, voice, media)
# ─────────────────══════════════════════════════════════════════════════════════

variable "volume_name" {
  description = "Name for the persistent volume"
  type        = string
  default     = "deepsynaps_data"
}

variable "volume_size" {
  description = "Size of the persistent volume in GB"
  type        = number
  default     = 10
}

variable "volume_replica_regions" {
  description = "Regions to replicate the volume to (for DR)"
  type        = list(string)
  default     = []
}

# ─────────────────═════════════════════════════════════════════════════════════
# Backup Configuration
# ─────────────────══════════════════════════════════════════════════════════════

variable "backup_enabled" {
  description = "Enable automated database backups"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 30
}

variable "backup_s3_endpoint" {
  description = "S3-compatible endpoint for backup storage (e.g., s3.amazonaws.com or s3.us-east-1.wasabisys.com)"
  type        = string
  default     = "s3.amazonaws.com"
}

variable "backup_s3_bucket" {
  description = "S3 bucket name for backup storage"
  type        = string
}

variable "backup_s3_region" {
  description = "S3 region for backup storage"
  type        = string
  default     = "us-east-1"
}

variable "backup_schedule" {
  description = "Cron schedule for automated backups (UTC). Production: every 15 min. Staging: every 6 hours."
  type        = string
  default     = "0 */6 * * *"
}

variable "backup_encryption_key_secret" {
  description = "Name of the Fly secret holding the backup encryption key"
  type        = string
  default     = "BACKUP_ENCRYPTION_KEY"
}

# ─────────────────────────────────────────────────────────────────────────────
# Maintenance Window
# ─────────────────────────────────────────────────────────────────────────────

variable "maintenance_window_start" {
  description = "Maintenance window start time in UTC (HH:MM format)"
  type        = string
  default     = "02:00"
}

variable "maintenance_window_end" {
  description = "Maintenance window end time in UTC (HH:MM format)"
  type        = string
  default     = "06:00"
}

variable "maintenance_timezone" {
  description = "Timezone for maintenance window"
  type        = string
  default     = "UTC"
}

# ─────────────────────────────────────────────────────────────────────────────
# Health Checks
# ─────────────────────────────────────────────────────────────────────────────

variable "health_check_grace_period" {
  description = "Grace period before health checks begin (seconds)"
  type        = string
  default     = "10s"
}

variable "health_check_interval" {
  description = "Health check interval"
  type        = string
  default     = "15s"
}

variable "health_check_timeout" {
  description = "Health check timeout"
  type        = string
  default     = "5s"
}

variable "health_check_path" {
  description = "HTTP path for health checks"
  type        = string
  default     = "/health"
}

# ─────────────────────────────────────────────────────────────────────────────
# Monitoring and Alerting
# ─────────────────────────────────────────────────────────────────────────────

variable "sentry_dsn" {
  description = "Sentry DSN for error tracking. Leave empty to disable."
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_webhook_url" {
  description = "Webhook URL for critical alerts (PagerDuty, Opsgenie, Slack, etc.)"
  type        = string
  default     = ""
  sensitive   = true
}

# ─────────────────────────────────────────────────────────────────────────────
# Secrets (passed through — never stored in state)
# ─────────────────────────────────────────────────────────────────────────────

variable "jwt_secret_key" {
  description = "JWT secret key for auth token signing. Set via fly secrets set."
  type        = string
  sensitive   = true
}

variable "secrets_key" {
  description = "Fernet key for encrypting persisted secrets (2FA/TOTP). Set via fly secrets set."
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Override database URL. If empty, constructed from postgres cluster."
  type        = string
  default     = ""
  sensitive   = true
}

variable "celery_broker_url" {
  description = "Override Celery broker URL. If empty, constructed from redis instance."
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_secret_key" {
  description = "Stripe secret key. Set via fly secrets set."
  type        = string
  default     = ""
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret. Set via fly secrets set."
  type        = string
  default     = ""
  sensitive   = true
}

# ─────────────────────────────────────────────────────────────────────────────
# Feature Flags
# ─────────────────────────────────────────────────────────────────────────────

variable "mri_demo_mode" {
  description = "Enable MRI demo mode (1) or real analysis (0)"
  type        = number
  default     = 0
}

variable "enable_deeptwin_simulation" {
  description = "Enable DeepTwin simulation outputs"
  type        = bool
  default     = false
}

variable "whisper_model" {
  description = "Whisper model size (base, small, medium, large)"
  type        = string
  default     = "base"
  validation {
    condition     = contains(["tiny", "base", "small", "medium", "large"], var.whisper_model)
    error_message = "Invalid Whisper model size."
  }
}
