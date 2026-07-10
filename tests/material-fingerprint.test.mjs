import assert from "node:assert/strict";
import test from "node:test";
import { materialFingerprint, phaseInputFingerprint } from "../dist/util/material-fingerprint.js";

test("material fingerprints are traversal-order independent but content and namespace sensitive", () => {
  const sourceA = { path: "src/a.ts", kind: "source", content: "export const a = 1;" };
  const sourceB = { path: "src/b.ts", kind: "source", content: "export const b = 2;" };
  const first = materialFingerprint([
    { label: "source", docs: [sourceB, sourceA] },
    { label: "corpus", docs: [] },
  ]);
  const reordered = materialFingerprint([
    { label: "corpus", docs: [] },
    { label: "source", docs: [sourceA, sourceB] },
  ]);
  const changed = materialFingerprint([
    { label: "source", docs: [sourceA, { ...sourceB, content: "export const b = 3;" }] },
    { label: "corpus", docs: [] },
  ]);
  const relabeled = materialFingerprint([{ label: "corpus", docs: [sourceA, sourceB] }]);

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.notEqual(first, relabeled);
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
});

test("phase input fingerprints normalize object key order while preserving values", () => {
  const first = phaseInputFingerprint({ phase: "verify", finding: { id: 7, status: "suspected" }, attempts: [1, 2] });
  const reordered = phaseInputFingerprint({ attempts: [1, 2], finding: { status: "suspected", id: 7 }, phase: "verify" });
  const changed = phaseInputFingerprint({ phase: "verify", finding: { id: 7, status: "confirmed-executable" }, attempts: [1, 2] });

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});
