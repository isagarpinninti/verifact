"use client";

import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { SOURCE_TYPES, sha256OfSource, utf8Length, type PrimarySource } from "@verifact/core";
import { Badge, Button, Card } from "@verifact/react";
import { IconButton, Section, Select, TextArea, TextInput } from "../ui";
import { Labeled, Row, type TabProps } from "./shared";

function uniqueId(base: string, taken: string[]): string {
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}${n}`;
  return id;
}

export function SourcesTab({ dossier, onChange }: TabProps) {
  const set = (i: number, patch: Partial<PrimarySource>): void => {
    const prev = dossier.sources[i];
    const next = { ...prev, ...patch };
    const renamed = patch.id !== undefined && patch.id !== prev.id;
    onChange({ ...dossier, sources: dossier.sources.map((s, k) => (k === i ? next : s)), claims: renamed ? dossier.claims.map((c) => (c.citation.sourceId === prev.id ? { ...c, citation: { ...c.citation, sourceId: next.id } } : c)) : dossier.claims });
  };
  const pin = async (i: number): Promise<void> => set(i, { expectedSha256: await sha256OfSource(dossier.sources[i].content) });
  const unpin = (i: number): void => {
    const { expectedSha256: _removed, ...rest } = dossier.sources[i];
    void _removed;
    onChange({ ...dossier, sources: dossier.sources.map((s, k) => (k === i ? rest : s)) });
  };
  return (
    <div className="@container space-y-6">
      <Section
        title="Primary sources"
        description="The immutable evidence: invoices, logs, contracts, IAM snapshots, wire feeds. Pin a SHA-256 so any later edit trips EC-105."
        action={
          <Button variant="secondary" onClick={() => onChange({ ...dossier, sources: [...dossier.sources, { id: uniqueId("source", dossier.sources.map((s) => s.id)), title: "New source", sourceType: "invoice_ledger", capturedAtIso: new Date().toISOString(), content: "Paste the raw primary source here.\n" }] })}>
            <Plus size={13} /> Add source
          </Button>
        }
      >
        <div className="space-y-4">
          {dossier.sources.map((s, i) => (
            <Card key={i} className="p-3.5">
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <Row>
                    <Labeled label="Id"><TextInput value={s.id} className="font-mono text-xs" onChange={(e) => set(i, { id: e.target.value })} /></Labeled>
                    <Labeled label="Title"><TextInput value={s.title} onChange={(e) => set(i, { title: e.target.value })} /></Labeled>
                    <Labeled label="Type">
                      <Select value={s.sourceType} onChange={(e) => set(i, { sourceType: e.target.value as PrimarySource["sourceType"] })} aria-label="Source type">
                        {SOURCE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                    </Labeled>
                    <Labeled label="Captured at"><TextInput value={s.capturedAtIso} className="font-mono text-xs" onChange={(e) => set(i, { capturedAtIso: e.target.value })} /></Labeled>
                  </Row>
                  <IconButton label={`Remove ${s.title}`} danger disabled={dossier.sources.length <= 1} onClick={() => onChange({ ...dossier, sources: dossier.sources.filter((_, k) => k !== i) })}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <Labeled label="Content (exact bytes)">
                  <TextArea rows={7} spellCheck={false} aria-label={`${s.title} content`} value={s.content} onChange={(e) => set(i, { content: e.target.value })} />
                </Labeled>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">{utf8Length(s.content)} bytes</Badge>
                  <Badge tone={s.expectedSha256 ? "cyan" : "slate"}><Fingerprint size={11} /> {s.expectedSha256 ? `pinned ${s.expectedSha256.slice(0, 12)}…` : "not pinned"}</Badge>
                  <Button variant="secondary" onClick={() => void pin(i)}>Pin current SHA-256</Button>
                  {s.expectedSha256 ? <Button variant="ghost" onClick={() => unpin(i)}>Unpin</Button> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
