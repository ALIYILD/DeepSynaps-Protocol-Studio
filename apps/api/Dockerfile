# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/

RUN npm ci

COPY apps/web ./apps/web
COPY packages/api-client ./packages/api-client

# Empty string → same-origin relative URLs (no hardcoded host)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build:web

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    ffmpeg \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libharfbuzz0b \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY packages ./packages
COPY apps/api ./apps/api
COPY pyproject.toml ./
COPY data ./data
# scripts/retry_stripe_webhooks.py is the loop body for the `stripe_worker`
# process group declared in apps/api/fly.toml. Without this COPY the worker
# crash-loops with `python: can't open file 'scripts/retry_stripe_webhooks.py'`.
COPY scripts ./scripts

# Evidence pipeline code (source of truth — pure Python stdlib, no extra deps).
# The SQLite evidence.db itself is gitignored and NOT baked in — mount it as
# a volume at /data/evidence.db in deployment, or run ingest once on boot:
#   python3 /app/services/evidence-pipeline/ingest.py --all --unpaywall
# The evidence_router serves 503 with a clear message until the DB exists.
RUN mkdir -p /app/services
COPY services/evidence-pipeline /app/services/evidence-pipeline
RUN ls -la /app/services /app/services/evidence-pipeline | head -20
ENV EVIDENCE_DB_PATH=/data/evidence.db

# Install torch CPU-only wheels first to avoid pulling ~2 GB CUDA binaries.
# Pin 2.2.2 — compatible with speechbrain >=1.0 and torchaudio 2.2.2.
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.2.2 \
    torchaudio==2.2.2

# Install voice-engine third-party deps (speechbrain, whisper, librosa, etc.)
# torch/torchaudio are already installed above so pip skips them here.
RUN pip install --no-cache-dir -r ./packages/voice-engine/requirements.txt

RUN pip install --no-cache-dir \
    -e ./packages/core-schema \
    -e ./packages/condition-registry \
    -e ./packages/modality-registry \
    -e ./packages/device-registry \
    -e ./packages/clinical-data-registry \
    -e ./packages/qa \
    -e ./packages/safety-engine \
    -e ./packages/generation-engine \
    -e ./packages/render-engine \
    -e ./packages/evidence \
    -e ./packages/mri-pipeline \
    -e ./packages/neuro-engine \
    -e ./packages/biometrics-pipeline \
    -e ./packages/qeeg-pipeline \
    -e ./packages/deeptwin-neuroai-lab \
    -e ./apps/api

# Create persistent volume mount point and data directories
RUN mkdir -p /data && \
    mkdir -p ./data/snapshots/clinical-database && \
    mkdir -p ./data/backups && \
    mkdir -p /data/media_uploads

COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "apps/api", "--workers", "1"]
