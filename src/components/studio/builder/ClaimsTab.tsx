"use client";

import { Plus, Trash2 } from "lucide-react";
import { resolveSourceSpan, type ClaimAssertion, type ClaimValue } from "@verifact/core";
import { Badge, Button, Card, Toggle } from "@verifact/react";
import { IconButton, NumberInput, Section, Select, TextArea, TextInput } from "../ui";
import { Labeled, OptionalNumber, OptionalText, Row, type TabProps } from "./shared";

function coerce(type: ClaimAssertion["valueType"], v: ClaimValue): ClaimValue {
  if (type === "number") return Number.isFinite(Number(v)) ? Number(v) : 0;
  if (type === "boolean") return v === true || v === "true";
  return String(v);
}

export function ClaimsTab({ dossier, onChange }: TabProps) {
  const set = (i: number, patch: Partial<ClaimAssertion>): void => {
    const prev = dossier.claims[i];
    const renamed = patch.id !== undefined && patch.id !== prev.id;
    const rename = <T,>(m: Record<string, T> | undefined): Record<string, T> | undefined => (m && renamed && prev.id in m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k === prev.id ? (patch.id as string) : k, v])) : m);
    onChange({
      ...dossier,
      claims: dossier.claims.map((c, k) => (k === i ? { ...c, ...patch } : c)),
      targetBridge: renamed ? { ...dossier.targetBridge, fieldMappings: rename(dossier.targetBridge.fieldMappings) ?? {}, telemetryMappings: rename(dossier.targetBridge.telemetryMappings) } : dossier.targetBridge,
    });
  };
  const setCite = (i: number, patch: Partial<ClaimAssertion["citation"]>): void => set(i, { citation: { ...dossier.claims[i].citation, ...patch } });
  const taken = dossier.claims.map((c) => c.id);
  return (
    <div className="@container space-y-6">
      <Section
        title="Claim anchors and excerpts"
        description="Each claim is the value an AI summary or vendor asserts, plus the verbatim excerpt of a primary source that must back it."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              let id = "c_new";
              for (let n = 2; taken.includes(id); n++) id = `c_new${n}`;
              onChange({ ...dossier, claims: [...dossier.claims, { id, label: "New claim", fieldKey: "newField", valueType: "number", claimedValue: 0, citation: { sourceId: dossier.sources[0].id, excerpt: "excerpt", required: true } }] });
            }}
          >
            <Plus size={13} /> Add claim
          </Button>
        }
      >
        <div className="space-y-4">
          {dossier.claims.map((c, i) => {
            const src = dossier.sources.find((s) => s.id === c.citation.sourceId);
            const span = src ? resolveSourceSpan(src.content, c.citation.excerpt) : null;
            return (
              <Card key={i} className="p-3.5">
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Row>
                      <Labeled label="Claim id"><TextInput value={c.id} className="font-mono text-xs" onChange={(e) => set(i, { id: e.target.value })} /></Labeled>
                      <Labeled label="Label"><TextInput value={c.label} onChange={(e) => set(i, { label: e.target.value })} /></Labeled>
                      <Labeled label="Field key"><TextInput value={c.fieldKey} className="font-mono text-xs" onChange={(e) => set(i, { fieldKey: e.target.value })} /></Labeled>
                      <Labeled label="Type">
                        <Select value={c.valueType} onChange={(e) => { const t = e.target.value as ClaimAssertion["valueType"]; set(i, { valueType: t, claimedValue: coerce(t, c.claimedValue) }); }} aria-label="Value type">
                          <option value="number">number</option>
                          <option value="string">string</option>
                          <option value="boolean">boolean</option>
                        </Select>
                      </Labeled>
                    </Row>
                    <IconButton label={`Remove ${c.label}`} danger disabled={dossier.claims.length <= 1} onClick={() => onChange({ ...dossier, claims: dossier.claims.filter((_, k) => k !== i) })}><Trash2 size={14} /></IconButton>
                  </div>
                  <Row>
                    <Labeled label="Claimed value">
                      {c.valueType === "number" ? <NumberInput value={Number(c.claimedValue)} step="any" onChange={(n) => set(i, { claimedValue: n })} /> : c.valueType === "boolean" ? (
                        <Select value={String(c.claimedValue)} onChange={(e) => set(i, { claimedValue: e.target.value === "true" })} aria-label="Claimed boolean"><option value="true">true</option><option value="false">false</option></Select>
                      ) : <TextInput value={String(c.claimedValue)} onChange={(e) => set(i, { claimedValue: e.target.value })} />}
                    </Labeled>
                    <Labeled label="Source">
                      <Select value={c.citation.sourceId} onChange={(e) => setCite(i, { sourceId: e.target.value })} aria-label="Cited source">
                        {dossier.sources.map((s) => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </Select>
                    </Labeled>
                    <Labeled label="Tolerance %" hint="Numbers only"><OptionalNumber label="Tolerance percent" value={c.citation.tolerancePct} placeholder="Exact" onChange={(n) => setCite(i, { tolerancePct: n })} /></Labeled>
                    <Labeled label="Required"><div className="pt-2"><Toggle checked={c.citation.required} onChange={(v) => setCite(i, { required: v })} label="Required" /></div></Labeled>
                  </Row>
                  <Labeled label="Excerpt (verbatim from the source)">
                    <TextArea rows={2} spellCheck={false} aria-label="Excerpt" value={c.citation.excerpt} onChange={(e) => setCite(i, { excerpt: e.target.value })} />
                  </Labeled>
                  <Row>
                    <Labeled label="Value after" hint="Marker inside the excerpt"><OptionalText mono label="Value after" value={c.citation.valueAfter} onChange={(v) => setCite(i, { valueAfter: v })} /></Labeled>
                    <Labeled label="Value ends at" hint="Strings only"><OptionalText mono label="Value end" value={c.citation.valueEnd} onChange={(v) => setCite(i, { valueEnd: v })} /></Labeled>
                    <div className="col-span-2 flex items-end pb-1">
                      {span?.found ? <Badge tone="cyan">[bytes {span.startByte}..{span.endByte}]{span.occurrences > 1 ? ` · ${span.occurrences} matches` : ""}</Badge> : <Badge tone="rose">excerpt not found in source</Badge>}
                    </div>
                  </Row>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
