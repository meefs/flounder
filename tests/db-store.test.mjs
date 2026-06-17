import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MetadataStore } from "../dist/db/store.js";

// The SQLite metadata store is the system of record for run TRACKING: projects, run
// lifecycle, scope coverage, findings, and their status transitions. These pin that a
// run's metadata is queryable and that status changes land on a timeline.

async function tempDb() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fsa-db-"));
  return new MetadataStore(path.join(dir, "fsa.db"));
}

test("store: project + run lifecycle is recorded and queryable", async () => {
  const db = await tempDb();
  const projectId = db.upsertProject({ name: "acme", sourcePaths: ["./src"], buildRoot: ".", config: { model: "gpt-5.5", thinking: "xhigh" } });
  const runId = db.startRun({ projectId, kind: "run", runDir: "/runs/acme-1", provider: "openai-codex", model: "gpt-5.5" });

  let runs = db.listRuns(projectId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "running");
  assert.equal(runs[0].ended_at, null);

  db.finishRun(runId, "done", { total: 10, audited: 4, pending: 6 }, 3);
  runs = db.listRuns(projectId);
  assert.equal(runs[0].status, "done");
  assert.equal(runs[0].scopes_audited, 4);
  assert.equal(runs[0].findings_total, 3);
  assert.ok(runs[0].ended_at);

  // upsertProject is idempotent by name (refreshes config, keeps the id)
  assert.equal(db.upsertProject({ name: "acme", config: { model: "opus" } }), projectId);
  assert.equal(db.listProjects().length, 1);
  db.close();
});

test("store: scope coverage tracks mapped vs audited", async () => {
  const db = await tempDb();
  const projectId = db.upsertProject({ name: "p" });
  db.upsertScopes(projectId, [
    { scopeId: "s1", title: "decode", status: "audited" },
    { scopeId: "s2", title: "settle", status: "pending" },
    { scopeId: "s3", title: "withdraw", status: "pending" },
  ]);
  assert.deepEqual(db.scopeProgress(projectId), { total: 3, audited: 1, pending: 2 });

  // re-mapping the same scope id updates it in place (one row per project+scope)
  db.upsertScopes(projectId, [{ scopeId: "s2", title: "settle", status: "audited" }]);
  assert.deepEqual(db.scopeProgress(projectId), { total: 3, audited: 2, pending: 1 });
  db.close();
});

test("store: finding status transitions land on a timeline", async () => {
  const db = await tempDb();
  const projectId = db.upsertProject({ name: "p" });
  const runId = db.startRun({ projectId, kind: "run", runDir: "/runs/p-1" });

  // first sighting → suspected (from null)
  db.upsertFindings(projectId, runId, [{ findingKey: "F1", title: "unbound input", status: "suspected" }]);
  // promoted by the differential gate
  db.upsertFindings(projectId, runId, [{ findingKey: "F1", title: "unbound input", status: "confirmed-differential" }], "differential passed");
  // later refuted by the skeptic
  db.upsertFindings(projectId, runId, [{ findingKey: "F1", title: "unbound input", status: "refuted" }], "vacuous PoC");

  const findings = db.listFindings(projectId);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].status, "refuted");

  const timeline = db.findingTimeline(findings[0].id);
  assert.deepEqual(timeline.map((e) => [e.from_status, e.to_status]), [
    [null, "suspected"],
    ["suspected", "confirmed-differential"],
    ["confirmed-differential", "refuted"],
  ]);
  // an unchanged re-upsert adds no event
  db.upsertFindings(projectId, runId, [{ findingKey: "F1", title: "unbound input", status: "refuted" }]);
  assert.equal(db.findingTimeline(findings[0].id).length, 3);
  db.close();
});

test("store: finding aggregates + pagination + filter scale to many findings", async () => {
  const db = await tempDb();
  const projectId = db.upsertProject({ name: "big" });
  const runId = db.startRun({ projectId, kind: "run", runDir: "/runs/big-1" });
  const statuses = ["confirmed-differential", "suspected", "refuted"];
  const rows = [];
  for (let i = 0; i < 120; i++) rows.push({ findingKey: "f" + i, title: "finding " + i + " in gadget", location: "src/c.rs:" + i, status: statuses[i % 3] });
  db.upsertFindings(projectId, runId, rows);

  // aggregate counts (one GROUP BY, used by the dashboard snapshot)
  assert.equal(db.countFindings(projectId), 120);
  assert.equal(db.findingStatusCounts(projectId)["suspected"], 40);

  // pagination: first page of 50, then the next page
  assert.equal(db.queryFindings(projectId, { limit: 50, offset: 0 }).length, 50);
  assert.equal(db.queryFindings(projectId, { limit: 50, offset: 100 }).length, 20);

  // status filter + filtered total
  assert.equal(db.countFindings(projectId, { status: "refuted" }), 40);
  assert.ok(db.queryFindings(projectId, { status: "refuted", limit: 10 }).every((r) => r.status === "refuted"));

  // text search over title/location
  assert.equal(db.countFindings(projectId, { search: "gadget" }), 120);
  assert.equal(db.countFindings(projectId, { search: "src/c.rs:7" }), 11); // :7, :70..:79
  db.close();
});

test("store: confirm decisions are replaced per run, not duplicated", async () => {
  const db = await tempDb();
  const projectId = db.upsertProject({ name: "p" });
  const runId = db.startRun({ projectId, kind: "confirm", runDir: "/runs/p-confirm-1" });
  db.upsertConfirmDecisions(projectId, runId, [
    { bug: "A", reproduced: "yes", recommendation: "submit-candidate" },
    { bug: "B", reproduced: "no", recommendation: "drop" },
  ], "/runs/p-confirm-1/confirm_report.md");
  assert.equal(db.listConfirmDecisions(projectId).length, 2);
  // a re-run of confirm rewrites the sheet wholesale
  db.upsertConfirmDecisions(projectId, runId, [{ bug: "A", reproduced: "yes", recommendation: "submit-candidate" }]);
  assert.equal(db.listConfirmDecisions(projectId).length, 1);
  db.close();
});
