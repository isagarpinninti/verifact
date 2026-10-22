"use client";

import { Toggle } from "@verifact/react";
import { NumberInput, Panel, Section } from "../ui";
import { Labeled, type TabProps } from "./shared";

const CODES: Array<[string, string]> = [
  ["EC-101", "Grounded: the claimed value appears verbatim in the cited bytes."],
  ["EC-102", "Tolerance drift: a number differs from the source but is within the claim's tolerance."],
  ["EC-103", "Hallucinated value: the summary says one thing, the source bytes say another."],
  ["EC-104", "Broken citation: the quoted excerpt does not exist in the source."],
  ["EC-105", "Source hash mismatch: a pinned source changed after capture."],
  ["EC-106", "Policy: the epistemic score is below the floor, or a source is unpinned when required."],
];

export function RulesTab({ dossier, onChange }: TabProps) {
  const p = dossier.policies;
  const set = (patch: Partial<typeof p>): void => onChange({ ...dossier, policies: { ...p, ...patch } });
  return (
    <div className="@container space-y-8">
      <Section title="Gate policy" description="When the hallucination gate blocks. Blocked dossiers cannot be sealed or bridged.">
        <div className="grid gap-5 @2xl:grid-cols-3">
          <Labeled label="Minimum epistemic score" hint="0–100. 100 is zero-tolerance."><NumberInput value={p.minEpistemicScore} min={0} max={100} onChange={(n) => set({ minEpistemicScore: Math.min(100, Math.max(0, n)) })} /></Labeled>
          <Labeled label="Allow drift within tolerance" hint="Off: any drift blocks."><div className="pt-2"><Toggle checked={p.allowWithinTolerance} onChange={(v) => set({ allowWithinTolerance: v })} label="Allow drift within tolerance" /></div></Labeled>
          <Labeled label="Require every source pinned" hint="Unpinned sources block (EC-106)."><div className="pt-2"><Toggle checked={p.requireAllSourcesHashed} onChange={(v) => set({ requireAllSourcesHashed: v })} label="Require every source pinned" /></div></Labeled>
        </div>
      </Section>
      <Section title="Checks" description="What each check means.">
        <Panel>
          <dl className="space-y-2">
            {CODES.map(([code, text]) => (
              <div key={code} className="flex gap-3 text-xs">
                <dt className="w-14 shrink-0 font-mono font-semibold text-slate-900 dark:text-slate-100">{code}</dt>
                <dd className="text-slate-600 dark:text-slate-300">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">Score: grounded claims count 1; tolerated drift counts 1 only when allowed; everything else 0. Required claims that fail block the gate regardless of the score.</p>
        </Panel>
      </Section>
    </div>
  );
}
