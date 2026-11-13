# QABS isolated Staging preparation — 2026-11-13

## Status
**PREPARATION ONLY — NOT READY TO DEPLOY.** This branch adds policy primitives and local tests. It does not change Cloudflare, Workers, routes, DNS, D1, R2, secrets, Shopify, production services, or customer data.

Base: `40a19c9fceed4c68bcd7ddc4e73952a7a7eaf8fe`  
Branch: `staging/qabs-isolation-preparation-20261113`

## Evidence carried forward
The read-only audit reported a reciprocal service-binding path:
- `qabs-digital-portal-staging` → `qabs-stores` via `COMMERCE`.
- `qabs-stores` → `qabs-digital-portal-staging` via `STUDIO`.
It also reported more-specific `recovered-formation/*`, `recovered-dashboard/*`, and `recovered-commerce/*` routes on the Staging hostname. Their current owners and complete downstream dependencies must be re-enumerated before any routing change.

The current `manifest-guard.mjs` hard-codes the existing isolated D1 UUID/name and R2 bucket. Those values are not proof that the contents are synthetic or that permissions are isolated. This preparation does not modify those constants.

## Changes in this branch
- `staging-worker/isolation-policy.mjs`: fail-closed validation primitives for an explicitly approved worker/D1/R2 inventory, no service bindings/routes/custom domains/Cron, synthetic-only classification, production-host denial, and explicit HTTPS outbound allowlists.
- `tests/staging-isolation-policy.test.mjs`: local unit tests for allowed and forbidden cases.
- This document: remediation sequence, gates, and limitations.

**Important:** these are policy primitives and tests, not yet wired into the deployed Worker, Wrangler config, Cloudflare API inventory, or CI. They must not be represented as enforcement until integrated and independently tested.

## Required next engineering work
1. Re-read all Worker scripts, routes, custom domains, bindings, vars, secret *names*, cron triggers, queues, KV, D1 and R2 metadata. Record ownership and exact environment labels.
2. Trace every Service Binding and every dynamic/static outbound URL from source; verify recovered route precedence and actual target Worker for each route.
3. Decide whether to create a parallel candidate Worker using a new approved name and independently approved D1/R2. Do not reuse current isolated DB/R2 until data classification, permissions and recoverability are proven.
4. Integrate policy checks with the actual deployment manifest and CI. Do not hard-code guessed resource IDs. Resource IDs must come from an approved inventory.
5. Add runtime egress tests and remote E2E tests against an isolated endpoint with synthetic accounts only. Prove no calls to `*.qabs1.store`, production Workers, production D1/R2, live email, payment or AI services.
6. Prove D1/R2 isolation and backup/restore in a separately approved target. Obtain Billing Read evidence and a cost estimate before creating resources or exporting data.
7. Keep `qabs-stores` and its `STUDIO` binding unchanged. Any production cutover is a separate project requiring a separate approval and rollback window.

## Acceptance gates
- No service bindings, production routes, custom domains, cron triggers or production secrets in the candidate.
- D1/R2 IDs and permissions are independently approved; data is synthetic-only.
- Static dependency scan plus observed runtime egress show no production destinations.
- Two synthetic tenants cannot access one another's records or objects.
- Auth, roles, request idempotency, credits concurrency, audit atomicity and file access pass local and remote tests.
- Backup and restore verified in a separate target; cost and impact documented.
- Exact commit, test logs and resource inventory retained.

## Current gate matrix
| Gate | Status |
|---|---|
| Source branch created from audited candidate | PASS |
| Policy primitives added | PASS |
| Policy unit tests authored | NOT RUN |
| Policy integrated into real deployment config | NOT DONE |
| All route/Worker dependencies re-enumerated | NOT VERIFIED |
| Production service-binding cycle removed | NOT DONE |
| New D1/R2 approved and created | NOT AUTHORIZED |
| Data classification and restore | NOT VERIFIED |
| Billing/cost | BLOCKED (Billing Read previously returned 403) |
| Remote E2E and observed egress | NOT RUN |
| Cloudflare/production changes | NOT PERFORMED |

## Safety boundary
No deploy, resource creation, D1 export/restore, data migration, binding/route/DNS change, secret read/write, Shopify change, payment operation, PR merge, or production modification is authorized by this branch.

## Follow-up: local preflight and workerd tests, 2026-11-13
The local Wrangler JSON preflight can be run as `npm run validate:staging-manifest -- <wrangler.json> <approved-inventory.json>`. The second JSON must contain `approved` resource identifiers and `environment` inventory. It checks an explicit allowlist and fails on service bindings, unknown keys, missing inventory and unapproved targets. A passing result is not evidence that a supplied inventory is true, that a remote resource is synthetic-only, or that runtime egress is restricted. It is not connected to a deployment pipeline; do not deploy on its result alone. `workers_dev` is not private by default; access controls require independent verification.

The legacy manifest guard also invokes policy validation, but remains pinned to the existing legacy targets. These are not approved here for deployment or testing. Local workerd tests now cover synthetic draft-store/product/order tenant boundaries as well as the existing auth, document and credit scenarios. Tests run only in local emulators; no remote data, payment, email or AI integration is exercised. The order endpoint only records a test order and reports payment disabled.

Before any deployment, obtain an independently verified inventory, prove remote isolation and synthetic classification, settle cost and backup/restore authorization, connect preflight and runtime egress controls to a reviewed deployment path, and pass remote end-to-end acceptance. No production-critical resource may be modified as part of preparation.
