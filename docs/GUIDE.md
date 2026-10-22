# Getting started

From an empty folder to a signed, verified evidence certificate. Outputs below were copied from real runs. Requires **Node.js 20+**.

## 1. Create a project

```bash
npx @verifact/cli init my-evidence
cd my-evidence
npx @verifact/cli validate
```

```
✔ Created my-evidence in /…/my-evidence
  verifact.config.json  issuer, trusted issuers, auth
  dossiers/       5 provenance dossiers, sources pinned by SHA-256
✔ my-evidence is valid
  5 dossiers · 41 claims · 11 sources
```

The five dossiers are a vendor invoice three-way match, a P1 incident root cause, a GPU cluster quote, SOC 2 audit evidence and a SaaS discount / ARR check.

## 2. Verify a grounded dossier

```bash
npx @verifact/cli verify vendor_invoice_three_way_match
```

```
Vendor Invoice Three-Way Match  VERIFIED_GROUNDED  epistemic score 100/100
  ✔ Vendor: claimed "Globex Supplies"  EXACT_GROUNDED [bytes 17..40]
  ✔ Invoice total (USD): claimed 62000  EXACT_GROUNDED [bytes 162..183]
  …
```

Each `[bytes a..b]` is the exact UTF-8 span of the cited excerpt in its source.

## 3. Catch a hallucination

Pretend an AI summary said `$6,200` (exit code **2**):

```bash
npx @verifact/cli verify vendor_invoice_three_way_match --set c_amount=6200
```

```
Vendor Invoice Three-Way Match  HALLUCINATION_BLOCKED  epistemic score 89/100
  ✖ Invoice total (USD): claimed 6200 · source 62000  HALLUCINATED_VALUE [bytes 162..183]
  ✖ EC-103 Hallucinated value in: Invoice total (USD).
  ✖ EC-106 Epistemic score 89 is below the required 100.
```

Add `--auto-ground` to rewrite the claim to the value in the source bytes:

```bash
npx @verifact/cli verify vendor_invoice_three_way_match --set c_amount=6200 --auto-ground
# VERIFIED_GROUNDED  epistemic score 100/100
```

## 4. Seal and verify a certificate

```bash
npx @verifact/cli certify vendor_invoice_three_way_match --out invoice.epc.json
npx @verifact/cli cert verify invoice.epc.json --dossier vendor_invoice_three_way_match
npx @verifact/cli ledger verify
```

```
✔ Sealed epc_04389e57b4ebad2f  ledger #1  → invoice.epc.json
✔ epc_04389e57b4ebad2f is authentic: signature, canonical form and claims verified, sources re-hashed
✔ Chain intact across 1 record(s). Chain and every certificate signature verified.
```

`certify` refuses (exit 2) to seal a blocked dossier. Passing `--dossier` re-hashes the project's sources against the certificate, so a source edited after sealing is caught.

## 5. Catch a changed source

Edit a number in `dossiers/vendor_invoice_three_way_match.json` (inside a source's `content`) and run `verify` again: every claim citing that source reports `SOURCE_HASH_MISMATCH` (EC-105). If the change was intentional (a new capture), run `verifact pin vendor_invoice_three_way_match`.

## 6. Open the Studio

```bash
npx @verifact/cli studio --open        # http://127.0.0.1:4319
```

| View | What you do there |
|---|---|
| **Truth Workbench** (⌘1) | Inject a 10x hallucination, corrupt one source byte, auto-ground, seal, then tamper with the certificate. Excerpts glow cyan, exact values amber. |
| **Dossier Studio** (⌘2) | Edit sources, claims and excerpts (live byte spans), gate rules, bridge mappings, import Markdown or JSON, edit the raw JSON. The right dock simulates your edits. Changes are saved as files in `dossiers/`. |
| **Ledger** (⌘3) | Certificates, **Verify chain**, inline tamper inspector, a box to verify any pasted `epc_` token. |
| **Trilogy Bridge** (⌘4) | Seal a dossier and see the Assentra payload and Pactline telemetry it produces; copy SDK and CLI snippets. |
| **Settings** (⌘5) | Theme, export / import, reset. |

⌘K opens the command bar.

## 7. Write your own dossier

Import a report: Studio → Dossier Studio → **Markdown/JSON Importer**. Sources are fenced blocks under `### Source: <title>`; claims are bullets under `## Claims`:

````markdown
# Q3 vendor summary

### Source: Vendor invoice [invoice_ledger]

```
INVOICE INV-7
Total Due: $4,200.00
```

## Claims
- Total Due: $4,200
````

Each claim is anchored to the first source line that mentions its label. Then tune excerpts, tolerances and the gate in the other tabs. Pin the sources, and `validate`.

## 8. Feed Assentra and Pactline

```bash
verifact bridge assentra vendor_invoice_three_way_match
verifact bridge pactline vendor_invoice_three_way_match
```

See [Trilogy bridge](TRILOGY_BRIDGE.md).

## 9. Production

```bash
export VERIFACT_API_KEY="$(openssl rand -hex 24)"
npx @verifact/cli studio --host 0.0.0.0
```

- Back up `.verifact/issuer-key.json`; ship `ledger.jsonl` to write-once storage.
- Capture and pin sources at the system of record. Verifact proves a claim matches the bytes it was given, not that the bytes are authentic.
- Docker: `docker build -t verifact . && docker run -p 4319:4319 -e VERIFACT_API_KEY=… -v "$PWD:/project" verifact`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `BROKEN_CITATION_SPAN` | The excerpt (or its `valueAfter` marker) is not in the source. Copy it verbatim. |
| `SOURCE_HASH_MISMATCH` | A pinned source changed. Restore it, or `verifact pin <id>` if the change is a new capture. |
| `several values in span` | The excerpt holds more than one number; set `valueAfter` to pin which one. |
| `Refusing to listen on … without authentication` | Set `VERIFACT_API_KEY` or create keys with `verifact auth add-key`. |
| Studio says **Local demo** | No server answered `/api/health`. Run `verifact studio` and open the URL it prints. |
