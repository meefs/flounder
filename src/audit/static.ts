import type { AuditItem, AuditResult, TrialFinding } from "../types.js";

export function runStaticAuditors(items: AuditItem[]): AuditResult[] {
  return items.map((item) => {
    const finding = staticFindingFor(item);
    return {
      item,
      nTrials: finding ? 1 : 0,
      nHits: finding ? 1 : 0,
      hitRate: finding ? 1 : 0,
      trials: finding ? [finding] : [],
    };
  });
}

function staticFindingFor(item: AuditItem): TrialFinding | undefined {
  if (item.seeder !== "halo2_advice_binding") return undefined;
  return {
    finding: true,
    title: "Advice input is not visibly bound to intended source",
    severity: "high",
    confidence: 0.78,
    description:
      "A scalar or point input is assigned into advice cells without local evidence of a copy or equality constraint binding those cells to the intended source before downstream gates rely on them.",
    evidence: `${item.location}: ${item.why}`,
    exploitSketch:
      "A malicious prover may choose a different private witness for the unbound advice cell while satisfying gates that only relate internal cells to each other.",
    fix: "Bind the first advice cell to the intended source with copy_advice or an explicit equality constraint, then rely on downstream internal consistency gates.",
  };
}
