import type { Doc, ProvenanceGraph } from "../types.js";
import { extractCairoStarknetProvenance } from "./cairo.js";
import { extractGoWormholeProvenance } from "./go.js";
import { extractHalo2Provenance } from "./halo2.js";
import { extractRustSolanaProvenance, extractRustZkProvenance } from "./rust.js";
import { extractSolidityProvenance } from "./solidity.js";

// Single place that runs every provenance adapter over loaded source. The staged
// pipeline consumes this at enumeration time. Provenance is attention-routing
// evidence only; it never asserts a bug.
export function extractAllProvenanceGraphs(source: Doc[]): ProvenanceGraph[] {
  return [
    extractHalo2Provenance(source),
    extractSolidityProvenance(source),
    extractRustSolanaProvenance(source),
    extractRustZkProvenance(source),
    extractCairoStarknetProvenance(source),
    extractGoWormholeProvenance(source),
  ].filter((graph) => graph.summary.facts > 0 || graph.summary.assignmentFlowObligations > 0);
}
