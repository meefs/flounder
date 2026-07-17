#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const VERSION_RE = /^\d+[.]\d+[.]\d+(?:[-+._a-zA-Z0-9]+)?$/;

export function readRustToolchain(target) {
  const file = findToolchainFile(target);
  if (!file) return { file: undefined, version: undefined };
  const content = readFileSync(file, "utf8");
  const version = path.basename(file) === "rust-toolchain.toml"
    ? content.match(/^\s*channel\s*=\s*["']([^"']+)["']/m)?.[1]
    : content.split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim()).find(Boolean);
  return { file, version };
}

export function buildRustSandboxSpec(input = {}) {
  const target = input.target ?? process.cwd();
  const detected = readRustToolchain(target);
  const version = requireVersion(input.rustVersion ?? detected.version);
  const runtime = input.runtime ?? "docker";
  if (runtime !== "docker" && runtime !== "container") {
    throw new Error(`Unsupported runtime "${runtime}". Use docker or container.`);
  }
  const root = path.resolve(input.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const dockerfile = path.join(root, "docker", "flounder-sandbox-rust.Dockerfile");
  const image = input.tag ?? `flounder-sandbox:rust-${version}`;
  return {
    image,
    runtime,
    program: runtime,
    args: [
      "build",
      "-f", dockerfile,
      "-t", image,
      "--build-arg", `RUST_VERSION=${version}`,
      root,
    ],
    dockerfile,
    context: root,
    toolchainFile: detected.file,
    version,
  };
}

function findToolchainFile(target) {
  let current = path.resolve(target);
  if (existsSync(current) && !isDirectory(current)) current = path.dirname(current);
  while (true) {
    for (const name of ["rust-toolchain.toml", "rust-toolchain"]) {
      const candidate = path.join(current, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function isDirectory(value) {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function requireVersion(value) {
  if (!value) throw new Error("No exact Rust release pin found. Add rust-toolchain.toml/rust-toolchain or pass --rust-version.");
  if (!VERSION_RE.test(value)) throw new Error(`Rust version "${value}" is not an exact supported release version.`);
  return value;
}

function parseArgs(argv) {
  const out = { execute: false, runtime: "docker" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      return value;
    };
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--dry-run") out.execute = false;
    else if (arg === "--target") out.target = next();
    else if (arg === "--tag") out.tag = next();
    else if (arg === "--runtime") out.runtime = next();
    else if (arg === "--rust-version") out.rustVersion = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("Usage: node scripts/rust-sandbox-image.mjs --target <dir> [--runtime docker|container] [--execute]\n\nBuilds a reviewed Rust sandbox image from an exact rust-toolchain pin. Without --execute it prints the exact command as JSON.");
    return;
  }
  const spec = buildRustSandboxSpec(options);
  if (!options.execute) {
    console.log(JSON.stringify(spec, null, 2));
    return;
  }
  const child = spawn(spec.program, spec.args, { stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
