"use client";

import { Section, TextInput } from "../ui";
import { Labeled, OptionalText, type TabProps } from "./shared";

export function BridgeTab({ dossier, onChange }: TabProps) {
  const b = dossier.targetBridge;
  const set = (patch: Partial<typeof b>): void => onChange({ ...dossier, targetBridge: { ...b, ...patch } });
  const setMap = (key: "fieldMappings" | "telemetryMappings", claimId: string, v: string): void => {
    const next = { ...(b[key] ?? {}) };
    if (v === "") delete next[claimId];
    else next[claimId] = v;
    set({ [key]: key === "telemetryMappings" && Object.keys(next).length === 0 ? undefined : next } as Partial<typeof b>);
  };
  return (
    <div className="@container space-y-8">
      <Section title="Trilogy targets" description="Where verified evidence goes next. Only grounded claims are ever mapped.">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <Labeled label="Assentra workflow id" hint="e.g. vendor_payment"><OptionalText mono label="Assentra workflow id" value={b.assentraWorkflowId} onChange={(v) => set({ assentraWorkflowId: v })} /></Labeled>
          <Labeled label="Pactline contract id" hint="e.g. fintech_wire_clearing_rail"><OptionalText mono label="Pactline contract id" value={b.pactlineContractId} onChange={(v) => set({ pactlineContractId: v })} /></Labeled>
        </div>
      </Section>
      <Section title="Field mappings" description="Map each claim to a Assentra workflow field and, for numbers, to a Pactline telemetry field. Blank = not sent.">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
                <th className="px-3 py-2 font-semibold">Claim</th>
                <th className="px-3 py-2 font-semibold">Assentra field</th>
                <th className="px-3 py-2 font-semibold">Pactline telemetry</th>
              </tr>
            </thead>
            <tbody>
              {dossier.claims.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-3 py-2"><div className="font-medium text-slate-900 dark:text-slate-100">{c.label}</div><div className="font-mono text-[10.5px] text-slate-400">{c.id}</div></td>
                  <td className="px-3 py-2"><TextInput aria-label={`${c.label} Assentra field`} value={b.fieldMappings[c.id] ?? ""} placeholder="—" className="font-mono text-xs" onChange={(e) => setMap("fieldMappings", c.id, e.target.value)} /></td>
                  <td className="px-3 py-2"><TextInput aria-label={`${c.label} Pactline telemetry`} disabled={c.valueType !== "number"} value={(b.telemetryMappings ?? {})[c.id] ?? ""} placeholder={c.valueType === "number" ? "—" : "numbers only"} className="font-mono text-xs" onChange={(e) => setMap("telemetryMappings", c.id, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
