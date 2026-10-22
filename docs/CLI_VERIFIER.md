# CLI and verifier server reference

## Project layout

```
my-evidence/
├── verifact.config.json   issuer, trusted issuers, auth, webhook
├── dossiers/<id>.json         one file per dossier (id must equal the file name)
└── .verifact/             created at runtime, git-ignored
    ├── issuer-key.json        issuer signing key (mode 0600). Back it up.
    └── ledger.jsonl           hash-chained certificates
```

### `verifact.config.json`

| Key | Default | Meaning |
|---|---|---|
| `name` | — | Project name. |
| `issuer` | — | `{ id, name }` of this verifier. |
| `trustedIssuers[]` | `[]` | Public JWKs of other issuers whose certificates this project accepts. |
| `auth.keys` | `{}` | `sha256(key) → label`, managed by `verifact auth add-key`. |
| `webhookUrl` | `""` | Receives `verifact.certificate.sealed` after each certification. |
| `allowPrivateNetworks` | `false` | Permit webhooks on private / loopback addresses. |

## Authentication

- No keys configured: loopback only. `--host 0.0.0.0` is refused.
- `VERIFACT_API_KEY`: the admin key (may edit the workspace).
- `verifact auth add-key <label>`: extra keys, stored hashed; they can evaluate, certify and read, but not edit the workspace.

Send `Authorization: Bearer <key>`. Comparison is constant-time; requests are rate limited per IP.

## HTTP API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Version, issuer fingerprint and public JWK (no auth). |
| `GET /api/workspace`, `PUT /api/workspace` | Read / replace dossiers (PUT is admin only and validated before any file is touched). |
| `POST /api/evaluate` | `{ dossierId \| dossier, claimOverrides?, sourceOverrides?, autoGround? }` → evaluation (+ grounding). Seals nothing. |
| `POST /api/certify` | Same body. 403 `hallucination_blocked` when the gate blocks; otherwise 201 with `token`, `certificateId`, `record`. |
| `GET /api/ledger`, `GET /api/ledger/verify` | List records / verify the chain and every certificate. |
| `POST /api/verify` | `{ token, dossierId? }` → signature, consistency, issuer trust and (with a dossier) a source re-hash. |
| `POST /api/bridge` | `{ target: "assentra" \| "pactline", token }` → the grounded payload (the certificate must verify). |

`dossier` may be an inline dossier (the Studio sends its working copy); it is validated and limited to 1 MB. `sourceOverrides` and `claimOverrides` are what-if inputs and never change the stored dossier.

**Concurrency.** `evaluate → seal → ledger append` is one serialised step per process, so parallel certifications always produce a single unforked chain. The webhook runs after the lock is released.

## Exit codes

`0` ok / grounded · `1` error · `2` hallucination blocked, verification failed or tampering detected.
