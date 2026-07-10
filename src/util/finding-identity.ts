import { createHash } from "node:crypto";

export function canonicalFindingKey(title: unknown, location: unknown, fallback?: unknown): string {
  const normalizedTitle = normalizeFindingIdentityPart(cleanFindingIdentityTitle(title));
  const normalizedLocation = normalizeFindingIdentityPart(location);
  const material = normalizedTitle || normalizedLocation
    ? `${normalizedLocation}\0${normalizedTitle}`
    : normalizeFindingIdentityPart(fallback);
  return `c${createHash("sha256").update(material || "unknown").digest("hex").slice(0, 20)}`;
}

export function cleanFindingIdentityTitle(value: unknown): string {
  return String(value ?? "").replace(/^\s*(?:REFUTED|CONFIRMED|DISCHARGED)\s*:\s*/i, "").trim();
}

function normalizeFindingIdentityPart(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
