"use client";

import { useState } from "react";
import { validateDossier } from "@verifact/core";
import { Button } from "@verifact/react";
import { Section, TextArea } from "../ui";
import type { TabProps } from "./shared";

export function JsonTab({ dossier, onChange }: TabProps) {
  const canonical = JSON.stringify(dossier, null, 2);
  const [text, setText] = useState(canonical);
  const [last, setLast] = useState(canonical);
  const [errors, setErrors] = useState<string[]>([]);
  if (canonical !== last) {
    setLast(canonical);
    setText(canonical);
    setErrors([]);
  }
  const dirty = text !== canonical;
  const apply = (): void => {
    try {
      const v = validateDossier(JSON.parse(text));
      if (v.ok && v.dossier) {
        setErrors([]);
        onChange(v.dossier);
      } else setErrors(v.errors);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Not valid JSON"]);
    }
  };
  return (
    <Section title="Dossier JSON" description="The portable dossier definition. Commit it to dossiers/<id>.json or edit it here.">
      <TextArea rows={26} spellCheck={false} aria-label="Dossier JSON" value={text} onChange={(e) => setText(e.target.value)} />
      {errors.length ? (
        <ul role="alert" className="space-y-1 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200">
          {errors.slice(0, 8).map((e) => <li key={e}>• {e}</li>)}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button variant="amber" disabled={!dirty} onClick={apply}>Apply JSON</Button>
        <Button variant="secondary" disabled={!dirty} onClick={() => { setText(canonical); setErrors([]); }}>Discard</Button>
      </div>
    </Section>
  );
}
