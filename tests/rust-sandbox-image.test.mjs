import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRustSandboxSpec } from "../scripts/rust-sandbox-image.mjs";

async function tempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("Rust sandbox target builder reads an exact rust-toolchain.toml release", async () => {
  const dir = await tempDir("flounder-rust-image-");
  try {
    await writeFile(path.join(dir, "rust-toolchain.toml"), "[toolchain]\nchannel = \"1.86.0\"\nprofile = \"minimal\"\n");
    const spec = buildRustSandboxSpec({ target: dir, runtime: "container", root: process.cwd() });

    assert.equal(spec.runtime, "container");
    assert.equal(spec.program, "container");
    assert.equal(spec.version, "1.86.0");
    assert.equal(spec.image, "flounder-sandbox:rust-1.86.0");
    assert.match(spec.args.join(" "), /RUST_VERSION=1\.86\.0/);
    assert.match(spec.dockerfile, /flounder-sandbox-rust\.Dockerfile$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Rust sandbox target builder reads the legacy rust-toolchain file", async () => {
  const dir = await tempDir("flounder-rust-image-legacy-");
  try {
    await writeFile(path.join(dir, "rust-toolchain"), "1.75.0\n");
    const spec = buildRustSandboxSpec({ target: dir, root: process.cwd() });
    assert.equal(spec.version, "1.75.0");
    assert.equal(spec.image, "flounder-sandbox:rust-1.75.0");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Rust sandbox target builder fails closed without an exact release pin", async () => {
  const dir = await tempDir("flounder-rust-image-unpinned-");
  try {
    await writeFile(path.join(dir, "rust-toolchain.toml"), "[toolchain]\nchannel = \"stable\"\n");
    assert.throws(() => buildRustSandboxSpec({ target: dir, root: process.cwd() }), /exact supported release/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
