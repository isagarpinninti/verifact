# @verifact/react

[![npm](https://img.shields.io/npm/v/@verifact/react?label=%40verifact%2Freact&color=black)](https://www.npmjs.com/package/@verifact/react)
[![CI](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml/badge.svg)](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-black.svg)](https://www.typescriptlang.org)

Four React primitives for Verifact plus a command bar. Ships a precompiled stylesheet scoped under `.ec-root`, so it never leaks into your app.

Part of [Verifact](https://github.com/isagarpinninti/verifact): bind claims to primary-source bytes, block hallucinations, seal evidence. Docs: [guide](https://github.com/isagarpinninti/verifact/blob/main/docs/GUIDE.md) · [spec](https://github.com/isagarpinninti/verifact/blob/main/docs/PROVENANCE_SPEC.md) · [Trilogy bridge](https://github.com/isagarpinninti/verifact/blob/main/docs/TRILOGY_BRIDGE.md).

## Install

```bash
npm install @verifact/react @verifact/core lucide-react react react-dom
```

Peer dependencies: React 18.2+ or 19, `react-dom`, `lucide-react`.

## Usage

```tsx
"use client";
import { useEffect, useState } from "react";
import { getDossierPack, evaluateRequest, type Evaluated } from "@verifact/core";
import { SurfaceRoot, ClaimSpanWeaveInspector, HallucinationGateCard } from "@verifact/react";
import "@verifact/react/styles.css";

const dossier = getDossierPack("vendor_invoice_three_way_match")!;

export function Evidence() {
  const [claims, setClaims] = useState<Record<string, string | number | boolean>>({});
  const [e, setE] = useState<Evaluated | null>(null);
  useEffect(() => {
    void evaluateRequest({ dossier, claimOverrides: claims }).then(setE);
  }, [claims]);
  if (!e) return null;
  return (
    <SurfaceRoot theme="dark">
      <ClaimSpanWeaveInspector results={e.evaluation.claimResults} onChangeClaim={(id, v) => setClaims((c) => ({ ...c, [id]: v }))} />
      <HallucinationGateCard evaluation={e.evaluation} onAutoGround={() => {}} />
    </SurfaceRoot>
  );
}
```

## Components
| Primitive | Purpose |
|---|---|
| `PrimarySourceVault` | Raw sources with live UTF-8 byte counts, SHA-256 digests (re-hashed as you type), pin status, and highlighted byte spans: excerpts in cyan, exact values in amber |
| `ClaimSpanWeaveInspector` | Every claim next to its source ground truth, byte span and status; edit a claim or inject a simulated hallucination and watch EC-103 trip |
| `HallucinationGateCard` | 0–100 epistemic gauge, checks EC-101…EC-106, auto-ground and seal actions |
| `EpistemicSealInspector` | Offline `epc_` verification, two tamper simulations and a Trilogy handoff drawer with Assentra and Pactline payloads |
| `CommandPalette` | A ⌘K command bar |

Wrap in `<SurfaceRoot theme="dark">` to force a theme, or add a `.dark` class to an ancestor. Re-theme with `--accent-50 … --accent-700` on `.ec-root`. The components hold no business logic: results come from `@verifact/core`.

MIT © [Sagar Pinninti](https://github.com/isagarpinninti)
