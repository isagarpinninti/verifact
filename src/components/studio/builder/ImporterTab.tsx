"use client";

import { useState } from "react";
import { FileJson, Wand2 } from "lucide-react";
import { dossierFromMarkdown, validateDossier, type ProvenanceDossier } from "@verifact/core";
import { Button } from "@verifact/react";
import { Section, TextArea } from "../ui";

const SAMPLE_MD = `# Q3 vendor summary

### Source: Vendor invoice [invoice_ledger]

\`\`\`
INVOICE INV-7
Vendor: Initech
Total Due: $4,200.00
PO Reference: PO-310
\`\`\`

## Claims
- Vendor: Initech
- Total Due: $4,200
- PO Reference: PO-310
`;

export function ImporterTab({ existingIds, onImport }: { existingIds: string[]; onImport: (d: ProvenanceDossier) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const run = (): void => {
    try {
      const t = text.trim();
      let dossier: ProvenanceDossier;
      let n: string[] = [];
      if (t.startsWith("{")) {
        const v = validateDossier(JSON.parse(t));
        if (!v.ok || !v.dossier) throw new Error(v.errors.join("; "));
        dossier = v.dossier;
        n = v.warnings;
      } else {
        const r = dossierFromMarkdown(t);
        dossier = r.dossier;
        n = r.notes;
      }
      let id = dossier.id;
      for (let k = 2; existingIds.includes(id); k++) id = `${dossier.id}_${k}`;
      onImport({ ...dossier, id });
      setNotes(n.length ? n : ["Imported."]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import");
      setNotes([]);
    }
  };

  return (
    <Section title="Markdown / JSON importer" description="Paste a Markdown report (sources as fenced blocks under “### Source: …”, claims as bullets under “## Claims”) or a dossier JSON. Each Markdown claim is anchored to the first source line that mentions its label.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setText(SAMPLE_MD)}><FileJson size={13} /> Sample Markdown</Button>
      </div>
      <TextArea rows={16} spellCheck={false} aria-label="Markdown or dossier JSON" value={text} onChange={(e) => setText(e.target.value)} placeholder={"# Report title\n\n### Source: Invoice [invoice_ledger]\n```\n…primary source…\n```\n\n## Claims\n- Total Due: $62,000"} />
      <div>
        <Button variant="amber" disabled={text.trim() === ""} onClick={run}><Wand2 size={14} /> Generate dossier</Button>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200">{error}</p> : null}
      {notes.length ? (
        <ul role="status" className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/5 dark:text-emerald-200">
          {notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      ) : null}
    </Section>
  );
}
