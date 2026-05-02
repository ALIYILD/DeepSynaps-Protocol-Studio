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
    && rm -rf /var/lib/apt/lists/*

COPY packages ./packages
COPY apps/api ./apps/api
COPY pyproject.toml ./
COPY data ./data

# Evidence pipeline code (source of truth — pure Python stdlib, no extra deps).
# The SQLite evidence.db itself is gitignored and NOT baked in — mount it as
# a volume at /data/evidence.db in deployment, or run ingest once on boot:
#   python3 /app/services/evidence-pipeline/ingest.py --all --unpaywall
# The evidence_router serves 503 with a clear message until the DB exists.
RUN mkdir -p /app/services
COPY services/evidence-pipeline /app/services/evidence-pipeline
RUN ls -la /app/services /app/services/evidence-pipeline | head -20
ENV EVIDENCE_DB_PATH=/data/evidence.db

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
    -e ./packages/biometrics-pipeline \
    -e ./apps/api

# Create persistent volume mount point and data directories
RUN mkdir -p /data && \
    mkdir -p ./data/snapshots/clinical-database && \
    mkdir -p ./data/backups && \
    mkdir -p /data/media_uploads

COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "apps/api", "--workers", "1"]
