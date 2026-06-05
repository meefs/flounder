#!/usr/bin/env node
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig, runPipeline } from "../dist/index.js";

const source = readFlag(process.argv.slice(2), "--source") ?? process.env.FSA_DISCOVERY_SOURCE;
if (!source) {
  throw new Error("Provide --source <path> or set FSA_DISCOVERY_SOURCE.");
}

const out = await mkdtemp(path.join(os.tmpdir(), "fsa-source-discovery-"));
const cfg = defaultConfig();
cfg.targetName = "source-discovery";
cfg.sourcePaths = [source];
cfg.outputDir = out;
cfg.dryRun = true;

const result = await runPipeline(cfg);
const summary = JSON.parse(await readFile(path.join(result.runDir, "summary.json"), "utf8"));
const findings = Array.isArray(summary.findings) ? summary.findings : [];
const bindingFinding = findings.find(
  (finding) => finding.failureMode === "missing_constraint" && /Advice input is not visibly bound/.test(finding.title),
);

if (!bindingFinding) {
  throw new Error("No high-confidence scalar/point advice-binding finding was discovered.");
}
if (bindingFinding.severity !== "high") {
  throw new Error(`Expected high severity for binding finding, got ${bindingFinding.severity}.`);
}

console.log(`Source discovery check passed: ${bindingFinding.location}`);

function readFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}
