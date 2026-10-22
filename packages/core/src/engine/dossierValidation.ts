import { DossierSchema, type ProvenanceDossier } from "../schemas/dossier";
import { resolveSourceSpan } from "./spanMatcher";

export interface DossierValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  dossier?: ProvenanceDossier;
}

/** Schema + cross-reference validation: unique ids, existing sources, excerpts present, markers inside excerpts. */
export function validateDossier(input: unknown): DossierValidation {
  const parsed = DossierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`), warnings: [] };
  const d = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const dupes = (ids: string[]): string[] => [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  for (const id of dupes(d.sources.map((s) => s.id))) errors.push(`source id '${id}' is declared more than once`);
  for (const id of dupes(d.claims.map((c) => c.id))) errors.push(`claim id '${id}' is declared more than once`);
  const sources = new Map(d.sources.map((s) => [s.id, s]));
  const claimIds = new Set(d.claims.map((c) => c.id));
  for (const c of d.claims) {
    const src = sources.get(c.citation.sourceId);
    if (!src) {
      errors.push(`claims.${c.id}: source '${c.citation.sourceId}' does not exist`);
      continue;
    }
    const span = resolveSourceSpan(src.content, c.citation.excerpt);
    if (!span.found) warnings.push(`claims.${c.id}: the excerpt is not in source '${src.id}' (will evaluate as BROKEN_CITATION_SPAN)`);
    else if (span.occurrences > 1) warnings.push(`claims.${c.id}: the excerpt occurs ${span.occurrences} times in '${src.id}'; the first occurrence is used`);
    if (c.citation.valueAfter !== undefined && !c.citation.excerpt.includes(c.citation.valueAfter)) errors.push(`claims.${c.id}: valueAfter '${c.citation.valueAfter}' is not inside the excerpt`);
    if (c.citation.valueEnd !== undefined && c.citation.valueAfter === undefined) errors.push(`claims.${c.id}: valueEnd needs valueAfter`);
    if (c.valueType === "number" && Number.isNaN(Number(c.claimedValue))) errors.push(`claims.${c.id}: claimedValue is not a number`);
  }
  for (const [map, name] of [[d.targetBridge.fieldMappings, "fieldMappings"], [d.targetBridge.telemetryMappings ?? {}, "telemetryMappings"]] as const) {
    for (const k of Object.keys(map)) if (!claimIds.has(k)) errors.push(`targetBridge.${name}: '${k}' is not a claim id`);
  }
  return { ok: errors.length === 0, errors, warnings, dossier: d };
}
