# Contributing

```bash
npm install
npm run build:packages   # build @verifact/core and @verifact/react
npm run dev              # Studio at http://localhost:3000 (proxies /api to a running `verifact studio`)
npm run ci               # build + lint + typecheck + tests + Studio export + smoke test (run before a PR)
```

## Repo layout
| Path | Purpose |
|---|---|
| `packages/core` | Framework-free engine (dossiers, grounding, certificates, ledger, bridges) with Vitest tests |
| `packages/react` | React primitives + scoped Tailwind stylesheet |
| `packages/cli` | The `verifact` binary and verifier server |
| `src/` | The Studio (Next.js, exported statically and bundled into the CLI) |
| `examples/demo` | A ready project: `npm run dev:server` |

## Guidelines
- Grounding, scoring and verification stay **pure and deterministic**: no network, no clock, no model calls, and never an expression or regex taken from a dossier.
- Every change to `packages/core` needs a test. Keep Zod schemas the single source of truth and stay compatible with Zod 3.23+ and 4 (no `z.strictObject`, no `z.toJSONSchema`).
- A blocked dossier must never produce a certificate or a non-empty `verifiedPayload`.
- No `any`, no `eval`, no placeholder code.
- UI changes must work in light and dark mode and at 375 px width.
- Never commit `.verifact/`, `.next/`, `dist/`, `studio-dist/` or `node_modules/`.
