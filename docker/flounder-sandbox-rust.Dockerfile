ARG RUST_VERSION
FROM rust:${RUST_VERSION}-bookworm AS rust-toolchain

FROM flounder-sandbox:latest

ARG RUST_VERSION

COPY --from=rust-toolchain /usr/local/cargo /usr/local/cargo
COPY --from=rust-toolchain /usr/local/rustup /usr/local/rustup

ENV RUSTUP_HOME=/usr/local/rustup
ENV PATH="/usr/local/cargo/bin:${PATH}"

RUN set -eux; \
  for tool in cargo rustc rustdoc rustup; do \
    ln -sf "/usr/local/cargo/bin/${tool}" "/usr/local/bin/${tool}"; \
  done; \
  test "$(rustc --version | awk '{print $2}')" = "${RUST_VERSION}"; \
  test "$(cargo --version | awk '{print $2}')" = "${RUST_VERSION}"

WORKDIR /workspace
