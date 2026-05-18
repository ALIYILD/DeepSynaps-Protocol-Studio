# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/

# `npm ci` is strict and trips over npm's known cross-platform optional-
# deps bug (Rollup ships per-platform binaries as optionalDeps; a lockfile
# generated on darwin-arm64 lacks the `packages` entry for
# `@rollup/rollup-linux-x64-gnu`, so `npm ci` aborts here on Linux even
# though the dep is listed). `npm install --include=optional` is lenient
# enough to fetch the right platform binary at build time.
# See https://github.com/npm/cli/issues/4828
RUN npm install --no-audit --no-fund --include=optional

COPY apps/web ./apps/web
COPY packages/api-client ./packages/api-client

# Empty string → same-origin relative URLs (no hardcoded host)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build:web

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies.
#
# `apt-get upgrade` is run BEFORE `install` so the resulting image picks up
# Debian point releases (deb13u3+) for libc6/libc-bin, libudev1/libsystemd0,
# libcap2, sed, libpcre, libxml2 etc. The base `python:3.11-slim` tag is
# rebuilt on a cadence and lags behind security advisories — this layer
# closes the gap on each rebuild. See PR body for the specific CVEs.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get -y --no-install-recommends upgrade \
    && apt-get install -y --no-install-recommends \
        gcc \
        ffmpeg \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libharfbuzz0b \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        shared-mime-info \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Bump pip / setuptools / wheel BEFORE any other pip install so all wheels
# below are built and unpacked by the patched toolchain:
#   - pip>=25.3 closes CVE-2025-8869 (tar extraction symlink, medium)
#   - wheel>=0.46.2 closes CVE-2026-24049 (high)
#   - setuptools>=80.9.0 ships jaraco.context>=6.1.0, closing CVE-2026-23949
#     (high; the vulnerable copy is the one vendored INSIDE setuptools)
# Pins are minimum-only so future patch releases roll forward.
RUN pip install --no-cache-dir --upgrade \
        'pip>=25.3,<26.0' \
        'setuptools>=80.9.0' \
        'wheel>=0.46.2'

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
#
# SECURITY NOTE: torch 2.2.2 is affected by CVE-2025-32434 (critical,
# torch.load arbitrary code execution via pickle when `weights_only=False`).
# The fix in torch 2.6.0 flips the `weights_only` default to True, which is
# a behavioural breaking change for 4 of 5 in-repo torch.load callers (only
# packages/qeeg-encoder/.../labram.py already passes weights_only=True).
# The CVE is NOT currently reachable from production: every torch.load path
# loads vendored model weights mounted at /opt/models/<backbone> at deploy
# time — never user-uploaded .pth files. Upgrade is deferred to a separate
# PR that audits each callsite and either adopts weights_only=True or
# explicitly trusts the source. See PR body "Deferred items" for detail.
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
