import type { AuditorConfig } from "../config.js";
import { effectiveFailureModes } from "../config.js";
import { assemble } from "../ingest/source.js";
import { renderProjectContext } from "../lens/context.js";
import { renderProjectProfile } from "../profile/project.js";
import type { Doc, LlmClient, ProjectLearning, ProjectProfile } from "../types.js";
import type { RunLogger } from "../trace/logger.js";
import { extractJsonObject } from "../util/json.js";

const MAX_LIST_ITEMS = 32;
const MAX_FIELD_CHARS = 1800;

export const PROJECT_LEARNING_SYSTEM = `You are the initialization stage of an automated white-hat security audit framework.
Your job is not to find bugs. Your job is to learn the target's security model from the loaded source, specs, books, papers, and configured high-level scope.
Produce concise planning notes that later agents can use to build audit lenses and checklist items.
Every note must be grounded in visible source, reference material, the deterministic profile, or explicitly configured project context.
Do not claim vulnerabilities, write exploits, include credentials, or include machine-specific paths.`;

export async function learnProject(input: {
  cfg: AuditorConfig;
  corpus: Doc[];
  source: Doc[];
  projectProfile: ProjectProfile;
  llm?: LlmClient;
  logger: RunLogger;
}): Promise<ProjectLearning> {
  if (input.cfg.dryRun || !input.llm || !input.cfg.projectLearning) {
    const empty: ProjectLearning = {};
    await input.logger.artifact("project_learning.json", empty);
    await input.logger.event("project_learning_skipped", {
      enabled: input.cfg.projectLearning,
      dryRun: input.cfg.dryRun,
      hasModel: Boolean(input.llm),
    });
    return empty;
  }

  const corpusText = assemble(input.corpus, Math.floor(input.cfg.contextCharBudget / 3));
  const sourceText = assemble(input.source, Math.floor(input.cfg.contextCharBudget / 2), true);
  const text = await input.llm.complete({
    tag: "learn_project",
    system: PROJECT_LEARNING_SYSTEM,
    user: buildProjectLearningPrompt({
      target: input.cfg.targetName,
      failureModes: effectiveFailureModes(input.cfg),
      projectProfile: renderProjectProfile(input.projectProfile),
      configuredProjectContext: renderProjectContext(input.cfg.projectContext),
      corpus: corpusText,
      source: sourceText,
    }),
    model: input.cfg.enumModel,
    maxTokens: input.cfg.maxTokens,
    thinkingLevel: input.cfg.thinkingLevel,
  });

  const learning = normalizeProjectLearning(extractJsonObject<unknown>(text));
  await input.logger.artifact("project_learning.json", learning);
  await input.logger.event("project_learning_done", {
    objectives: learning.securityObjectives?.length ?? 0,
    invariants: learning.candidateInvariants?.length ?? 0,
    mechanics: learning.implementationMechanics?.length ?? 0,
  });
  return learning;
}

export function buildProjectLearningPrompt(input: {
  target: string;
  failureModes: string[];
  projectProfile: string;
  configuredProjectContext: string;
  corpus: string;
  source: string;
}): string {
  return `Target: ${input.target}

Known failure-mode vocabulary:
${input.failureModes.join(", ")}

Deterministic project profile:
${input.projectProfile}

Configured high-level project context:
${input.configuredProjectContext}

Study the loaded material as an unfamiliar codebase. Extract the security experience a competent auditor would need before building a checklist.

Return a JSON object with these optional fields:
- scopeSummary: one short paragraph describing the audited surface visible in the loaded material
- securityObjectives: high-level security goals implied by the scope, specs, docs, source, or configured context
- domainConcepts: domain terms and mechanics that later agents should understand
- trustBoundaries: boundaries where attacker-controlled data, prover-controlled data, remote input, user identity, or external state crosses into trusted logic
- attackerCapabilities: capabilities visible or implied by the loaded material
- candidateInvariants: properties that appear necessary for correctness or security and should be checked later
- implementationMechanics: source-backed mechanisms, APIs, flows, algorithms, or checks that affect the audit
- uncertainty: important missing context or assumptions that later stages should treat carefully
- evidenceRefs: file/function/doc references that support the notes

Rules:
- Do not produce audit checklist items here. This stage learns context; enumeration happens later.
- Do not claim that a bug exists.
- If a reference document teaches a framework, protocol, or DSL semantics, summarize the neutral semantics needed for auditing.
- Keep each note source-backed or explicitly mark it as uncertainty.
- If the loaded source is narrow, keep the learning narrow.

Return only a JSON object. No markdown fences.

===== REFERENCE / SPEC MATERIAL =====
${input.corpus || "(none provided)"}

===== SOURCE UNDER AUDIT =====
${input.source || "(none provided)"}
`;
}

export function normalizeProjectLearning(input: unknown): ProjectLearning {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: ProjectLearning = {};
  const scopeSummary = cleanString(raw.scopeSummary ?? raw.scope_summary, MAX_FIELD_CHARS);
  if (scopeSummary) out.scopeSummary = scopeSummary;
  setList(out, "securityObjectives", raw.securityObjectives ?? raw.security_objectives);
  setList(out, "domainConcepts", raw.domainConcepts ?? raw.domain_concepts);
  setList(out, "trustBoundaries", raw.trustBoundaries ?? raw.trust_boundaries);
  setList(out, "attackerCapabilities", raw.attackerCapabilities ?? raw.attacker_capabilities);
  setList(out, "candidateInvariants", raw.candidateInvariants ?? raw.candidate_invariants);
  setList(out, "implementationMechanics", raw.implementationMechanics ?? raw.implementation_mechanics);
  setList(out, "uncertainty", raw.uncertainty);
  setList(out, "evidenceRefs", raw.evidenceRefs ?? raw.evidence_refs);
  return out;
}

export function renderProjectLearning(learning: ProjectLearning | undefined): string {
  if (!learning || Object.keys(learning).length === 0) return "(not available)";
  return [
    learning.scopeSummary ? `Scope summary: ${learning.scopeSummary}` : "",
    renderList("Security objectives", learning.securityObjectives),
    renderList("Domain concepts", learning.domainConcepts),
    renderList("Trust boundaries", learning.trustBoundaries),
    renderList("Attacker capabilities", learning.attackerCapabilities),
    renderList("Candidate invariants", learning.candidateInvariants),
    renderList("Implementation mechanics", learning.implementationMechanics),
    renderList("Uncertainty", learning.uncertainty),
    renderList("Evidence refs", learning.evidenceRefs),
  ].filter(Boolean).join("\n");
}

function setList<K extends keyof ProjectLearning>(out: ProjectLearning, key: K, value: unknown): void {
  const cleaned = cleanStringList(value);
  if (cleaned.length > 0) out[key] = cleaned as ProjectLearning[K];
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanString(item, MAX_FIELD_CHARS)).filter((item): item is string => item !== undefined))].slice(
    0,
    MAX_LIST_ITEMS,
  );
}

function cleanString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length === 0 ? undefined : cleaned.slice(0, maxChars);
}

function renderList(label: string, values: string[] | undefined): string {
  return values && values.length > 0 ? `${label}: ${values.join("; ")}` : "";
}
