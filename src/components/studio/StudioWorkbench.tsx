"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSearch, Plus, Search, Trash2 } from "lucide-react";
import { validateDossier, type ProvenanceDossier } from "@verifact/core";
import { cn } from "@verifact/react";
import { blankDossier } from "@/lib/blankDossier";
import type { EvidenceClient } from "@/lib/client";
import { BridgeTab } from "./builder/BridgeTab";
import { ClaimsTab } from "./builder/ClaimsTab";
import { ImporterTab } from "./builder/ImporterTab";
import { JsonTab } from "./builder/JsonTab";
import { RulesTab } from "./builder/RulesTab";
import { SimulatorDock } from "./builder/SimulatorDock";
import { SourcesTab } from "./builder/SourcesTab";
import type { TerminalEvent } from "./log";
import { EmptyState, IconButton, Tabs, TextInput } from "./ui";

export type StudioCommand = { id: number; name: "new-dossier" | "focus-filter" } | null;

type TabId = "sources" | "claims" | "rules" | "bridge" | "importer" | "json";

interface Props {
  dossiers: ProvenanceDossier[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSave: (d: ProvenanceDossier) => void;
  onDelete: (id: string) => void;
  onIssues: (n: number) => void;
  events: TerminalEvent[];
  onClearEvents: () => void;
  client: EvidenceClient | null;
  command: StudioCommand;
}

/** Dossier Studio: dossier rail, six editing tabs and the right-hand simulator dock. */
export function StudioWorkbench({ dossiers, selectedId, onSelect, onSave, onDelete, onIssues, events, onClearEvents, client, command }: Props) {
  const [tab, setTab] = useState<TabId>("sources");
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { dossier: ProvenanceDossier; errors: string[] }>>({});
  const filterRef = useRef<HTMLInputElement>(null);
  const lastCommand = useRef<number>(0);

  const saved = dossiers.find((d) => d.id === selectedId) ?? dossiers[0] ?? null;
  const draft = saved ? drafts[saved.id] : undefined;
  const current = draft?.dossier ?? saved;

  const issueCount = Object.keys(drafts).length;
  useEffect(() => {
    onIssues(issueCount);
  }, [issueCount, onIssues]);

  const create = (d?: ProvenanceDossier): void => {
    const ids = dossiers.map((x) => x.id);
    let n = 1;
    while (ids.includes(`new_dossier_${n}`)) n++;
    const next = d ?? blankDossier(`new_dossier_${n}`, `New dossier ${n}`);
    onSave(next);
    onSelect(next.id);
    setTab("sources");
  };

  useEffect(() => {
    if (!command || command.id === lastCommand.current) return;
    lastCommand.current = command.id;
    const t = setTimeout(() => {
      if (command.name === "new-dossier") create();
      else filterRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
    // `create` closes over the latest dossiers; the command id gates re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  const edit = (next: ProvenanceDossier): void => {
    const v = validateDossier(next);
    if (v.ok && v.dossier) {
      setDrafts((d) => {
        const { [next.id]: _removed, ...rest } = d;
        void _removed;
        return rest;
      });
      onSave(v.dossier);
    } else setDrafts((d) => ({ ...d, [next.id]: { dossier: next, errors: v.errors } }));
  };

  const visible = useMemo(() => dossiers.filter((d) => `${d.name} ${d.id} ${d.category}`.toLowerCase().includes(filter.toLowerCase())), [dossiers, filter]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_420px]">
      <nav aria-label="Dossiers" className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r dark:border-white/10 dark:bg-slate-950">
        <div className="space-y-2 border-b border-slate-200 p-3 dark:border-white/10">
          <button type="button" onClick={() => create()} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:bg-white dark:text-black dark:hover:bg-slate-200">
            <span className="flex items-center gap-1.5"><Plus size={14} /> New dossier</span>
            <kbd className="rounded border border-white/25 px-1 text-[10px] dark:border-black/30">N</kbd>
          </button>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput ref={filterRef} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter dossiers" aria-label="Filter dossiers" className="py-1.5 pl-8 text-xs" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2 max-lg:max-h-48">
          {visible.map((d) => {
            const active = d.id === current?.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelect(d.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn("relative mb-0.5 flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg py-2 pl-4 pr-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40", active ? "bg-white shadow-sm ring-1 ring-slate-200 dark:bg-white/10 dark:ring-white/10" : "hover:bg-slate-100 dark:hover:bg-white/5")}
                >
                  {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-slate-900 dark:bg-white" /> : null}
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{d.name}</span>
                    {drafts[d.id] ? <span title="Has unapplied errors" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{d.category} · {d.claims.length} claims</span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className="px-3 py-6 text-center text-xs text-slate-400">No dossiers match.</li> : null}
        </ul>
      </nav>

      <section className="@container flex min-h-0 min-w-0 flex-col">
        {current ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 lg:px-6 dark:border-white/10">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{current.name}</h1>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">dossiers/{current.id}.json · {current.sources.length} sources</p>
              </div>
              <IconButton label={`Delete ${current.name}`} danger disabled={dossiers.length <= 1} onClick={() => onDelete(current.id)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
            <div className="px-4 lg:px-6">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "sources", label: "Primary Sources", badge: current.sources.length },
                  { id: "claims", label: "Claim Anchors & Excerpts", badge: current.claims.length },
                  { id: "rules", label: "Tolerance & Gate Rules" },
                  { id: "bridge", label: "Trilogy Bridge Mapping" },
                  { id: "importer", label: "Markdown/JSON Importer" },
                  { id: "json", label: "Dossier JSON" },
                ]}
              />
            </div>
            {draft ? (
              <ul role="alert" className="mx-4 mt-3 space-y-0.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 lg:mx-6 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                <li className="font-semibold">Changes are held until the dossier validates:</li>
                {draft.errors.slice(0, 5).map((e) => <li key={e}>• {e}</li>)}
              </ul>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
              <div className="studio-fade mx-auto max-w-4xl" key={tab}>
                {tab === "sources" ? <SourcesTab dossier={current} onChange={edit} /> : null}
                {tab === "claims" ? <ClaimsTab dossier={current} onChange={edit} /> : null}
                {tab === "rules" ? <RulesTab dossier={current} onChange={edit} /> : null}
                {tab === "bridge" ? <BridgeTab dossier={current} onChange={edit} /> : null}
                {tab === "importer" ? <ImporterTab existingIds={dossiers.map((d) => d.id)} onImport={(d) => create(d)} /> : null}
                {tab === "json" ? <JsonTab dossier={current} onChange={edit} /> : null}
              </div>
            </div>
          </>
        ) : (
          <div className="p-6"><EmptyState icon={<FileSearch size={28} />} title="No dossiers yet">Create one with “New dossier” or import a Markdown report.</EmptyState></div>
        )}
      </section>

      {current ? (
        <div className="hidden min-h-0 xl:block">
          <SimulatorDock dossier={saved ?? current} client={client} events={events} onClear={onClearEvents} />
        </div>
      ) : null}
    </div>
  );
}
