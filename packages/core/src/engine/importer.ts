import { DossierSchema, SOURCE_TYPES, type ProvenanceDossier } from "../schemas/dossier";
import { parseBooleanWord, parseNumberToken } from "./spanMatcher";
import { validateDossier } from "./dossierValidation";

export interface MarkdownImport {
  dossier: ProvenanceDossier;
  notes: string[];
}

const camel = (s: string): string => {
  const c = s.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, ch: string | undefined) => (ch ? ch.toUpperCase() : ""));
  const out = c.charAt(0).toLowerCase() + c.slice(1);
  return /^[a-z]/.test(out) ? out.slice(0, 40) : `f${out}`.slice(0, 40);
};
const slug = (s: string): string => {
  const out = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(out) && out.length >= 2 ? out.slice(0, 60) : `dossier_${out || "import"}`.slice(0, 60);
};

/**
 * Builds a dossier from Markdown: sources are fenced code blocks under `### Source: <title>` and claims are
 * bullets (`- Label: value`) under `## Claims`. Each claim is anchored to the first source line containing its label.
 */
export function dossierFromMarkdown(markdown: string, opts: { id?: string; name?: string } = {}): MarkdownImport {
  const notes: string[] = [];
  const lines = markdown.split(/\r?\n/);
  const title = opts.name ?? lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim() ?? "Imported dossier";
  const sources: Array<{ title: string; content: string }> = [];
  const claims: Array<{ label: string; raw: string }> = [];
  let mode: "none" | "claims" = "none";
  let pendingTitle: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const src = /^###\s+Source:\s*(.+)$/i.exec(line);
    if (src) {
      pendingTitle = src[1].replace(/\s*\[[^\]]*\]\s*$/, "").trim();
      mode = "none";
      continue;
    }
    if (/^##\s+Claims/i.test(line)) {
      mode = "claims";
      pendingTitle = null;
      continue;
    }
    if (/^```/.test(line) && pendingTitle !== null) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      sources.push({ title: pendingTitle, content: `${body.join("\n")}\n` });
      pendingTitle = null;
      continue;
    }
    if (mode === "claims") {
      const m = /^\s*[-*]\s+(.+?)\s*[:=]\s*(.+?)\s*$/.exec(line);
      if (m) claims.push({ label: m[1], raw: m[2] });
    }
  }
  if (sources.length === 0) throw new Error("No sources found: add `### Source: <title>` followed by a fenced code block");
  if (claims.length === 0) throw new Error("No claims found: add a `## Claims` section with `- Label: value` bullets");

  const used = new Set<string>();
  const srcDefs = sources.map((s, i) => {
    let id = camel(s.title) || `source${i + 1}`;
    for (let n = 2; used.has(id); n++) id = `${camel(s.title)}${n}`;
    used.add(id);
    return { id, title: s.title, sourceType: SOURCE_TYPES[0], capturedAtIso: new Date().toISOString(), content: s.content };
  });
  const claimIds = new Set<string>();
  const claimDefs = claims.map((c) => {
    const num = parseNumberToken(c.raw.replace(/\s+/g, ""));
    const bool = parseBooleanWord(c.raw);
    const valueType = num !== null ? "number" : bool !== null ? "boolean" : "string";
    const claimedValue = valueType === "number" ? (num as number) : valueType === "boolean" ? (bool as boolean) : c.raw.replace(/^["']|["']$/g, "");
    let id = `c_${camel(c.label)}`;
    for (let n = 2; claimIds.has(id); n++) id = `c_${camel(c.label)}${n}`;
    claimIds.add(id);
    const needle = c.label.toLowerCase();
    for (const s of srcDefs) {
      const line = s.content.split("\n").find((l) => l.toLowerCase().includes(needle));
      if (line === undefined) continue;
      const at = line.toLowerCase().indexOf(needle);
      const excerpt = line.slice(at).trimEnd();
      const afterLabel = at + c.label.length;
      const markerLen = c.label.length + (/^\s*[:=]/.test(line.slice(afterLabel)) ? line.slice(afterLabel).search(/[:=]/) + 1 : 0);
      return { id, label: c.label, fieldKey: camel(c.label), valueType, claimedValue, citation: { sourceId: s.id, excerpt, valueAfter: excerpt.slice(0, markerLen), required: true } };
    }
    notes.push(`No source line mentions "${c.label}": the claim was anchored to a placeholder and will evaluate as BROKEN_CITATION_SPAN.`);
    return { id, label: c.label, fieldKey: camel(c.label), valueType, claimedValue, citation: { sourceId: srcDefs[0].id, excerpt: c.label, required: true } };
  });
  const draft = { id: opts.id ?? slug(title), name: title, version: "1.0.0", category: "Procurement", description: "Imported from Markdown.", sources: srcDefs, claims: claimDefs };
  const v = validateDossier(draft);
  if (!v.ok || !v.dossier) throw new Error(`Imported dossier is invalid: ${v.errors.join("; ")}`);
  notes.push(`Imported ${srcDefs.length} source(s) and ${claimDefs.length} claim(s); each claim is anchored to the first line that mentions its label.`);
  return { dossier: DossierSchema.parse(v.dossier), notes: [...notes, ...v.warnings] };
}
