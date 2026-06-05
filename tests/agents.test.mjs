import assert from "node:assert/strict";
import test from "node:test";
import { buildAuditPrompt, buildDeepeningPrompt, buildEnumerationPrompt } from "../dist/agents/prompts.js";
import { createAgentRegistry, getAuditorAgent } from "../dist/agents/registry.js";
import { defaultConfig, effectiveFailureModes } from "../dist/config.js";

test("auditor agent registry can be extended with custom failure modes", () => {
  const cfg = defaultConfig();
  cfg.auditorAgents = [
    {
      failureMode: "custom_constraint_system",
      id: "custom-constraint-system-auditor",
      displayName: "Custom Constraint System Auditor",
      guidance: "Trace custom DSL constraints from assigned witnesses to enforced equations.",
    },
  ];

  const registry = createAgentRegistry(cfg.auditorAgents);
  const agent = getAuditorAgent("custom_constraint_system", registry);
  assert.equal(agent.id, "custom-constraint-system-auditor");
  assert.ok(effectiveFailureModes(cfg).includes("custom_constraint_system"));

  const prompt = buildAuditPrompt(
    {
      id: "custom-1",
      location: "fixtures/custom.dsl:10",
      securityProperty: "Every assigned value must be constrained.",
      failureMode: "custom_constraint_system",
      why: "Custom test item.",
    },
    "assign witness without constraint",
    registry,
  );
  assert.match(prompt, /Custom Constraint System Auditor/);
  assert.match(prompt, /Trace custom DSL constraints/);
});

test("default prompts do not embed report-specific source-binding hints", () => {
  const cfg = defaultConfig();
  const enumeration = buildEnumerationPrompt({
    target: "neutral",
    failureModes: effectiveFailureModes(cfg),
    projectProfile: "Languages: Rust",
    projectLearning: "Candidate invariants: checked statements should enforce their required properties.",
    projectContext: "",
    lensPacks: "",
    corpus: "",
    source: "fn example() {}",
  });
  const audit = buildAuditPrompt(
    {
      id: "neutral-1",
      location: "src/lib.rs:1",
      securityProperty: "A checked property is enforced.",
      failureMode: "missing_constraint",
      why: "Neutral test item.",
    },
    "fn example() {}",
  );
  const deepening = buildDeepeningPrompt({
    target: "neutral",
    round: 2,
    maxItems: 4,
    failureModes: effectiveFailureModes(cfg),
    projectProfile: "Languages: Rust",
    projectLearning: "Domain concepts: local checks and state transitions.",
    projectContext: "",
    lensPacks: "",
    existingChecklist: "",
    auditObservations: "",
    currentFindings: "",
    corpus: "",
    source: "fn example() {}",
  });

  const combined = `${enumeration}\n${audit}\n${deepening}`;
  assert.doesNotMatch(combined, /source[- ]binding/i);
  assert.doesNotMatch(combined, /row[- ]to[- ]row/i);
  assert.doesNotMatch(combined, /row constancy/i);
  assert.doesNotMatch(combined, /intended source/i);
  assert.doesNotMatch(combined, /\bwitness\b|\badvice\b/i);
  assert.doesNotMatch(combined, /assign_advice|copy_advice/i);
});
