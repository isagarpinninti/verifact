# @verifact/cli

[![npm](https://img.shields.io/npm/v/@verifact/cli?label=%40verifact%2Fcli&color=black)](https://www.npmjs.com/package/@verifact/cli)
[![CI](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml/badge.svg)](https://github.com/isagarpinninti/verifact/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-black.svg)](https://www.typescriptlang.org)

The `verifact` command. Verify claims against primary-source bytes in CI, block hallucinations, seal `epc_` certificates, run a hash-chained provenance ledger and a self-hosted Provenance Studio.

Part of [Verifact](https://github.com/isagarpinninti/verifact): bind claims to primary-source bytes, block hallucinations, seal evidence. Docs: [guide](https://github.com/isagarpinninti/verifact/blob/main/docs/GUIDE.md) · [spec](https://github.com/isagarpinninti/verifact/blob/main/docs/PROVENANCE_SPEC.md) · [Trilogy bridge](https://github.com/isagarpinninti/verifact/blob/main/docs/TRILOGY_BRIDGE.md).

## Install

```bash
npm install -g @verifact/cli        # then: verifact <command>
npx @verifact/cli <command>         # or run without installing
```

Requires Node.js 20+.

## Quickstart

```bash
verifact init my-evidence && cd my-evidence
verifact validate
verifact verify vendor_invoice_three_way_match --set c_amount=6200 --auto-ground
verifact certify vendor_invoice_three_way_match --out invoice.epc.json
verifact studio --open              # http://127.0.0.1:4319
```

## Commands
| Command | Purpose | Exit codes |
|---|---|---|
| `init [dir] [--name] [--force]` | Create `verifact.config.json` and `dossiers/` (sources SHA-256 pinned) | 0 / 1 |
| `validate [dir] [--json]` | Validate config and every dossier (citations are resolved) | 0 / 1 |
| `verify <dossierId> [--set claimId=value] [--auto-ground] [--json]` | Check every claim against its source bytes | 0 grounded · 2 blocked · 1 error |
| `certify <dossierId> [--set …] [--auto-ground] [--out file]` | Seal an `epc_` certificate and append it to the ledger | 0 / 2 / 1 |
| `pin <dossierId>` | Re-pin source digests after an intentional source change | 0 / 1 |
| `studio [dir] [--port 4319] [--host 127.0.0.1] [--open]` | Provenance Studio + JSON API | — |
| `ledger verify\|list [dir]` | Verify chain + every certificate, or list | 0 intact · 2 tampered |
| `cert verify <file.epc.json\|epc_…> [--dossier id]` | Verify a certificate offline (and re-hash a dossier's sources) | 0 / 2 |
| `bridge assentra\|pactline <dossierId\|file\|token>` | Output the grounded payload for Assentra or Pactline | 0 / 2 |
| `key show [dir]` · `auth add-key <label>` | Issuer key fingerprint · verifier API key | 0 |

`verify`, `certify`, `cert verify`, `ledger verify` and `bridge` are safe CI gates: exit `2` means a hallucination was blocked or verification failed.

## Server API
`GET /api/health` · `GET|PUT /api/workspace` · `POST /api/evaluate` · `POST /api/certify` · `GET /api/ledger` · `GET /api/ledger/verify` · `POST /api/verify` · `POST /api/bridge`.

`POST /api/certify` is the authority: it evaluates, refuses with 403 when the gate blocks, signs, appends to `.verifact/ledger.jsonl` (serialised, so the chain never forks) and delivers the webhook. Reference: [docs/CLI_VERIFIER.md](https://github.com/isagarpinninti/verifact/blob/main/docs/CLI_VERIFIER.md).

## Security
Loopback only unless authenticated (`VERIFACT_API_KEY` or `verifact auth add-key`). Webhooks to private addresses are blocked at connect time. Back up `.verifact/issuer-key.json`. See the [security policy](https://github.com/isagarpinninti/verifact/blob/main/SECURITY.md).

MIT © [Sagar Pinninti](https://github.com/isagarpinninti)
