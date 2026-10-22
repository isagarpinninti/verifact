import { sha256Hex } from "../crypto/keys";
import type { ClaimCitation, ClaimValue } from "../schemas/dossier";

const encoder = new TextEncoder();

export const utf8Length = (s: string): number => encoder.encode(s).length;

export interface ByteSpan {
  startChar: number;
  endChar: number;
  startByte: number;
  endByte: number;
}

export interface ResolvedSpan extends ByteSpan {
  found: boolean;
  /** How many times the excerpt occurs. The first occurrence is used; more than one is reported, never guessed. */
  occurrences: number;
}

function spanAt(content: string, startChar: number, endChar: number): ByteSpan {
  const startByte = utf8Length(content.slice(0, startChar));
  return { startChar, endChar, startByte, endByte: startByte + utf8Length(content.slice(startChar, endChar)) };
}

/** Locates `excerpt` inside `content`, returning character and exact UTF-8 byte offsets. */
export function resolveSourceSpan(content: string, excerpt: string): ResolvedSpan {
  const none: ResolvedSpan = { found: false, occurrences: 0, startChar: 0, endChar: 0, startByte: 0, endByte: 0 };
  if (excerpt === "") return none;
  const first = content.indexOf(excerpt);
  if (first < 0) return none;
  let occurrences = 0;
  for (let i = content.indexOf(excerpt); i >= 0; i = content.indexOf(excerpt, i + excerpt.length)) occurrences++;
  return { found: true, occurrences, ...spanAt(content, first, first + excerpt.length) };
}

export const sha256OfSource = (content: string): Promise<string> => sha256Hex(content);

/* ───────────────────────── value extraction ───────────────────────── */

interface Token<T> {
  value: T;
  /** Character range inside the cited excerpt. */
  start: number;
  end: number;
}

// Numbers like 62,000.50, $62k, 12s, 99.98%. Hyphenated ids (INV-2291) are not numbers.
const NUMBER = /(?<![\w.$-])[-+]?\$?\s?\d[\d,]*(?:\.\d+)?(?:[kKmM](?![A-Za-z]))?%?/g;

export function parseNumberToken(raw: string): number | null {
  const m = /^([-+]?)\$?\s?(\d[\d,]*(?:\.\d+)?)([kKmM])?%?$/.exec(raw.trim());
  if (!m) return null;
  const base = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult = m[3] ? (m[3].toLowerCase() === "k" ? 1e3 : 1e6) : 1;
  return (m[1] === "-" ? -1 : 1) * base * mult;
}

export function numberTokens(text: string): Token<number>[] {
  const out: Token<number>[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const v = parseNumberToken(m[0]);
    if (v !== null) out.push({ value: v, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const TRUE_WORDS = new Set(["true", "yes", "enabled", "pass", "passed", "compliant"]);
const FALSE_WORDS = new Set(["false", "no", "disabled", "fail", "failed", "non-compliant"]);

export function parseBooleanWord(raw: string): boolean | null {
  const w = raw.trim().toLowerCase();
  return TRUE_WORDS.has(w) ? true : FALSE_WORDS.has(w) ? false : null;
}

function booleanTokens(text: string): Token<boolean>[] {
  const out: Token<boolean>[] = [];
  for (const m of text.matchAll(/\b(true|false|yes|no|enabled|disabled|passed?|failed?|compliant|non-compliant)\b/gi)) {
    const v = parseBooleanWord(m[0]);
    if (v !== null) out.push({ value: v, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** String value following a marker: up to `valueEnd`, else up to `|`, `,`, `;` or a line break. */
function stringAfter(text: string, markerEnd: number, valueEnd: string | undefined): Token<string> | null {
  let rest = text.slice(markerEnd);
  const lead = rest.length - rest.trimStart().length;
  rest = rest.slice(lead);
  let len: number;
  if (valueEnd !== undefined) {
    const idx = rest.indexOf(valueEnd);
    len = idx < 0 ? rest.length : idx;
  } else {
    const m = /[|,;\r\n]/.exec(rest);
    len = m ? m.index : rest.length;
  }
  const raw = rest.slice(0, len);
  const value = raw.trim();
  if (value === "") return null;
  const start = markerEnd + lead;
  return { value, start, end: start + raw.trimEnd().length };
}

export interface GroundValue {
  /** The value found in the primary source, or null when nothing in the span can ground the claim. */
  value: ClaimValue | null;
  /** Character range of the value inside the excerpt. */
  start: number;
  end: number;
  /** More than one candidate in the span and nothing pinned the choice. */
  ambiguous: boolean;
  /** `valueAfter` was set but its marker is not inside the excerpt. */
  markerMissing: boolean;
}

const NO_VALUE: GroundValue = { value: null, start: 0, end: 0, ambiguous: false, markerMissing: false };

const sameNumber = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Reads the ground-truth value for a claim out of the cited excerpt. Deterministic: no regex from user input. */
export function extractGroundValue(excerpt: string, valueType: "number" | "string" | "boolean", citation: Pick<ClaimCitation, "valueAfter" | "valueEnd">, claimed: ClaimValue): GroundValue {
  let from = 0;
  if (citation.valueAfter !== undefined) {
    const at = excerpt.indexOf(citation.valueAfter);
    if (at < 0) return { ...NO_VALUE, markerMissing: true };
    from = at + citation.valueAfter.length;
  }
  const pinned = citation.valueAfter !== undefined;

  if (valueType === "string") {
    if (pinned) {
      const t = stringAfter(excerpt, from, citation.valueEnd);
      return t ? { value: t.value, start: t.start, end: t.end, ambiguous: false, markerMissing: false } : NO_VALUE;
    }
    const needle = String(claimed);
    const at = needle === "" ? -1 : excerpt.indexOf(needle);
    return at < 0 ? NO_VALUE : { value: needle, start: at, end: at + needle.length, ambiguous: false, markerMissing: false };
  }

  const region = excerpt.slice(from);
  if (valueType === "number") {
    const tokens = numberTokens(region).map((t) => ({ ...t, start: t.start + from, end: t.end + from }));
    if (tokens.length === 0) return NO_VALUE;
    const pick = pinned ? tokens[0] : tokens.length === 1 ? tokens[0] : null;
    if (pick) return { value: pick.value, start: pick.start, end: pick.end, ambiguous: false, markerMissing: false };
    const want = Number(claimed);
    const exact = tokens.find((t) => sameNumber(t.value, want));
    if (exact) return { value: exact.value, start: exact.start, end: exact.end, ambiguous: false, markerMissing: false };
    const nearest = tokens.reduce((best, t) => (Math.abs(t.value - want) < Math.abs(best.value - want) ? t : best));
    return { value: nearest.value, start: nearest.start, end: nearest.end, ambiguous: true, markerMissing: false };
  }

  const tokens = booleanTokens(region).map((t) => ({ ...t, start: t.start + from, end: t.end + from }));
  if (tokens.length === 0) return NO_VALUE;
  const pick = pinned ? tokens[0] : tokens.length === 1 ? tokens[0] : null;
  if (pick) return { value: pick.value, start: pick.start, end: pick.end, ambiguous: false, markerMissing: false };
  const exact = tokens.find((t) => t.value === claimed);
  const chosen = exact ?? tokens[0];
  return { value: chosen.value, start: chosen.start, end: chosen.end, ambiguous: exact === undefined, markerMissing: false };
}

export function valuesEqual(valueType: "number" | "string" | "boolean", a: ClaimValue, b: ClaimValue): boolean {
  if (valueType === "number") return sameNumber(Number(a), Number(b));
  return a === b;
}

/** Relative difference in percent between a claimed and a source number (absolute when the source is 0). */
export function driftPct(claimed: number, source: number): number {
  return source === 0 ? Math.abs(claimed) * 100 : (Math.abs(claimed - source) / Math.abs(source)) * 100;
}
