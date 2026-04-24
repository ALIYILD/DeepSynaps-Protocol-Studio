# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY apps/web ./apps/web

# Empty string → same-origin relative URLs (no hardcoded host)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build:web

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

COPY packages ./packages
COPY apps/api ./apps/api
COPY pyproject.toml ./
COPY data ./data
# Cache-bust: include clinical-database CSVs

# Evidence pipeline (pure-Python stdlib). The SQLite evidence.db itself is
# gitignored and lives on the persistent /data volume (EVIDENCE_DB_PATH).
# To populate after first deploy:
#   fly ssh console -C 'python3 /app/services/evidence-pipeline/ingest.py --all --unpaywall'
COPY services/evidence-pipeline ./services/evidence-pipeline
ENV EVIDENCE_DB_PATH=/data/evidence.db

RUN pip install --no-cache-dir \
    -e ./packages/core-schema \
    -e ./packages/condition-registry \
    -e ./packages/modality-registry \
    -e ./packages/device-registry \
    -e ./packages/safety-engine \
    -e ./packages/generation-engine \
    -e ./packages/render-engine \
    -e ./packages/qeeg-pipeline \
    -e ./packages/mri-pipeline \
    -e ./apps/api

RUN mkdir -p ./data/snapshots/clinical-database ./data/backups

# Force fresh copy of frontend build — prevents Docker cache from serving
# stale dist files when frontend-builder stage produces new bundle hashes.
RUN rm -rf ./apps/web/dist 2>/dev/null || true
COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--app-dir", "apps/api"]
