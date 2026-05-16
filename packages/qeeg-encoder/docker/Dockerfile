# qEEG encoder runtime image
# Foundation-model weights are NEVER baked in. They are mounted at /opt/models/<backbone>.
# License lock is verified at build time.

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for scipy, numpy wheels are sufficient on slim.
# `apt-get upgrade` pulls Debian point-release security patches on rebuild.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get -y --no-install-recommends upgrade \
    && apt-get install -y --no-install-recommends \
        build-essential libsndfile1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Bump pip / setuptools / wheel before any other install so the patched
# toolchain unpacks every wheel that follows (closes pip / wheel / vendored
# jaraco.context CVEs — see PR body).
RUN pip install --no-cache-dir --upgrade \
        'pip>=25.3,<26.0' \
        'setuptools>=80.9.0' \
        'wheel>=0.46.2'

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

