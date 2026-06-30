import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../dist/config.js";
import { updateProjectHistory } from "../dist/trace/history.js";

async function writeText(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

async function writeJson(file, value) {
  await writeText(file, JSON.stringify(value, null, 2));
}

function emptySummary() {
  return {
    coverage: {
      itemsTotal: 0,
      itemsWithFinding: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      itemsNeedingRetry: 0,
      modelErrorTrials: 0,
      parseErrorTrials: 0,
      needsMoreContextTrials: 0,
      verifiedFindings: 0,
      unverifiedFindings: 0,
    },
    findings: [],
  };
}

test("project history indexes durable run artifacts but skips transient copied workspaces", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "flounder-history-"));
  const runDir = path.join(out, "run-1");
  await writeJson(path.join(runDir, "summary.json"), emptySummary());
  await writeJson(path.join(runDir, "audit_findings.json"), []);
  await writeText(path.join(runDir, "events.jsonl"), JSON.stringify({ kind: "run_start", ts: "2026-06-29T00:00:00.000Z" }) + "\n");
  await writeText(path.join(runDir, "report_f1.md"), "# Report\n");
  await writeJson(path.join(runDir, "calls", "0001.json"), { ok: true });
  await writeText(path.join(runDir, "reproduction", "poc.test.js"), "assert(true);\n");
  await writeText(path.join(runDir, "reproductions", "alt.txt"), "alt\n");

  await writeText(path.join(runDir, "audit", "verify-1", "workspace", "result.json"), "{}\n");
  await writeText(path.join(runDir, "confirm", "workspace", "fork.json"), "{}\n");
  await writeText(path.join(runDir, "external", "docs", "report.md"), "# external\n");
  await writeText(path.join(runDir, "sources", "contract", "src", "Railgun.sol"), "contract Railgun {}\n");
  await writeText(path.join(runDir, "node_modules", "pkg", "index.js"), "module.exports = {};\n");
  await writeText(path.join(runDir, "calls", "node_modules", "pkg", "index.js"), "module.exports = {};\n");

  const cfg = {
    ...defaultConfig(),
    targetName: "history-material-skip",
    outputDir: out,
    sourcePaths: ["/configured/source"],
    corpusPaths: ["/configured/spec.md"],
  };
  const manifest = await updateProjectHistory({
    cfg,
    runDir,
    summary: emptySummary(),
    items: [],
    results: [],
    completedRounds: 1,
  });

  const paths = manifest.materials.map((material) => material.path);
  assert.ok(paths.some((entry) => entry.endsWith("/run-1/summary.json")));
  assert.ok(paths.some((entry) => entry.endsWith("/run-1/events.jsonl")));
  assert.ok(paths.some((entry) => entry.endsWith("/run-1/calls/0001.json")));
  assert.ok(paths.some((entry) => entry.endsWith("/run-1/reproduction/poc.test.js")));
  assert.ok(paths.some((entry) => entry.endsWith("/run-1/reproductions/alt.txt")));

  for (const forbidden of ["/audit/", "/confirm/", "/external/", "/sources/", "/node_modules/"]) {
    assert.equal(paths.some((entry) => entry.includes(`/run-1${forbidden}`)), false, `indexed transient path ${forbidden}`);
  }
});
