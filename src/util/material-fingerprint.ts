import { createHash } from "node:crypto";
import type { Doc } from "../types.js";

/**
 * Content-address the exact readable material supplied to a phase. Labels keep
 * source/build/corpus namespaces distinct while sorted public paths make the
 * result stable across traversal order and machines.
 */
export function materialFingerprint(parts: Array<{ label: string; docs: Doc[] }>): string {
  const hash = createHash("sha256");
  for (const part of [...parts].sort((a, b) => a.label.localeCompare(b.label))) {
    hash.update(`label\0${part.label}\0`);
    for (const doc of [...part.docs].sort((a, b) => a.path.localeCompare(b.path))) {
      hash.update(`path\0${doc.path}\0kind\0${doc.kind}\0bytes\0${Buffer.byteLength(doc.content)}\0`);
      hash.update(doc.content);
      hash.update("\0");
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

export function phaseInputFingerprint(input: unknown): string {
  const hash = createHash("sha256");
  hash.update(stableJson(input));
  return `sha256:${hash.digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
}
