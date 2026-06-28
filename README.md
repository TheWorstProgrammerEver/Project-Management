# Project Management

Project Management is a Supabase-backed, API-first backlog for Codex-managed work.

The core product is the worker claim contract: agents do not pick tasks from a list directly. They call the worker API, and Postgres grants exactly one active lease for one ready work item.

## Get Going

Prerequisites:

- Node.js and npm
- Docker

From a fresh clone:

```sh
npm run get-going
```

The script installs npm dependencies when needed, starts local Supabase, serves Edge Functions, starts Vite on `0.0.0.0`, writes ignored local config to `public/config.local.json`, and prints localhost plus LAN endpoints.

This repo pins a local Node 22 runtime through the `node` dev dependency because Debian 12 ships Node 18, while the current Vite/Vitest/Supabase toolchain expects Node 20+. Workflow scripts still bootstrap with ambient Node; app tooling runs through `node_modules/node/bin/node`.

## Worker API

Local endpoint:

```text
POST http://127.0.0.1:54321/functions/v1/worker
```

Include:

```text
x-worker-secret: local-dev-worker-secret
content-type: application/json
```

Actions:

- `claim_next_work_item`: `workerId`, `workerDisplayName`, `workerCapabilities`, `leaseSeconds`
- `heartbeat_lease`: `leaseToken`, `leaseSeconds`
- `release_lease`: `leaseToken`, `reason`
- `complete_work_item`: `leaseToken`, `resultSummary`, `resultUrl`
- `fail_work_item`: `leaseToken`, `errorSummary`

Example:

```sh
curl -s http://127.0.0.1:54321/functions/v1/worker \
  -H 'content-type: application/json' \
  -H 'x-worker-secret: local-dev-worker-secret' \
  -d '{
    "action": "claim_next_work_item",
    "workerId": "daedalus",
    "workerDisplayName": "Daedalus",
    "workerCapabilities": ["code", "github"],
    "leaseSeconds": 1800
  }'
```

## Web UI

The authenticated UI is an operator console:

- backlog board grouped by status
- task creation and status updates
- task detail with acceptance criteria, active lease, result links, and recent worker events
- worker API reference at `/api`

## Runtime Config

`public/config.js` is the committed browser loader. It synchronously loads one JSON config file:

- `public/config.local.json` when `#{CONFIG_FILE}#` has not been substituted
- the substituted `#{CONFIG_FILE}#` path when present

`public/config.json` is the committed deployment template and should be substituted by CI/CD. `npm run get-going` generates ignored `public/config.local.json` for the current machine/LAN.

## Verification

Use:

```sh
npm run lint
npm test
npm run build
```

Security tests require local Supabase and Edge Functions:

```sh
npm run get-going
npm run test:security
npm run all-done
```

The security suite follows the Friendly Ledger pattern: it verifies anonymous users cannot call app functions or read/mutate app tables directly, the worker function requires its secret, and concurrent worker claims cannot lease the same ready item twice.
