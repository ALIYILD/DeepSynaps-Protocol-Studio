# qEEG encoder runtime image
# Foundation-model weights are NEVER baked in. They are mounted at /opt/models/<backbone>.
# License lock is verified at build time.

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for scipy, numpy wheels are sufficient on slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src
COPY configs ./configs

RUN pip install -e . && \
    python -m qeeg_encoder.cli lockcheck --path configs/models.lock.yaml

# Non-root
RUN useradd -m -u 10001 app && chown -R app:app /app
USER app

# Foundation weights mounted here at runtime
VOLUME ["/opt/models"]

EXPOSE 9090

ENV QEEG_ENCODER__FOUNDATION__WEIGHTS_DIR=/opt/models/labram-base \
    QEEG_ENCODER__FOUNDATION__DEVICE=cpu

CMD ["qeeg-encoder-consume"]

