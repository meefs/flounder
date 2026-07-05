FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    cmake \
    cargo \
    coreutils \
    findutils \
    gawk \
    git \
    golang-go \
    grep \
    jq \
    libgmp-dev \
    nodejs \
    ninja-build \
    pkg-config \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    ripgrep \
    rustc \
    sed \
  && node --version \
  && npm --version \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g yarn@1.22.22 pnpm@9.15.9 \
  && yarn --version \
  && pnpm --version

ARG FOUNDRY_VERSION=stable
ENV FOUNDRY_DIR=/root/.foundry
ENV PATH="${FOUNDRY_DIR}/bin:${PATH}"

RUN curl -L https://foundry.paradigm.xyz | bash \
  && if [ "$FOUNDRY_VERSION" = "stable" ]; then foundryup; else foundryup --install "$FOUNDRY_VERSION"; fi \
  && install -m 0755 "${FOUNDRY_DIR}/bin/forge" /usr/local/bin/forge \
  && install -m 0755 "${FOUNDRY_DIR}/bin/cast" /usr/local/bin/cast \
  && install -m 0755 "${FOUNDRY_DIR}/bin/anvil" /usr/local/bin/anvil \
  && install -m 0755 "${FOUNDRY_DIR}/bin/chisel" /usr/local/bin/chisel \
  && forge --version \
  && cast --version \
  && anvil --version

WORKDIR /workspace
