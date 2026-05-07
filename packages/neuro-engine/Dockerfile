FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends software-properties-common curl ca-certificates git \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-dev \
        python3.11-distutils \
        python3-pip \
        build-essential \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/local/bin/python3

WORKDIR /opt/deepsynaps-neuro-engine

COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install -r requirements.txt

COPY pyproject.toml README.md ./
COPY src ./src
COPY tests ./tests

RUN python -m pip install -e .

EXPOSE 8000

ENV DEEPSYNAPS_BIDS_ROOT=/data/bids \
    DEEPSYNAPS_OUTPUT_ROOT=/data/output \
    DEEPSYNAPS_WORK_ROOT=/data/work \
    DEEPSYNAPS_MODELS_ROOT=/models

CMD ["python", "-m", "uvicorn", "deepsynaps.neuro_engine.api.routes:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
