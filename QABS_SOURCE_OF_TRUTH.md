# QABS source-of-truth map

> Verified during the 2026-11-12 operations audit. This document records observed ownership; it is not a claim that every requested module is production-complete.

## Runtime ownership

| Area | Current observed source of truth | Boundary |
|---|---|---|
| Public storefront and checkout | Shopify at `qabs1.store` | Do not replace or modify checkout without explicit approval. |
| Customer portal and Studio route | Cloudflare Worker routes under `portal.qabs1.store` | The current UI exposes preview/planned areas; verify backend persistence per feature. |
| Isolated staging smoke environment | Cloudflare Worker `qabs-isolated-staging-worker-staging` + D1 `qabs-isolated-staging-db-20261110` + R2 `qabs-isolated-staging-artifacts-20261110` | Non-production only. Health output is sanitized. |
| Demo | Cloudflare Pages project `qabs-123-demo` at `demo.qabs1.store` | Demonstration environment; HTTP 200 is not a readiness proof. |
| Main application repository | GitHub `velouraa12-design/Qabs-123` | Current repo is a Vite/React front end with local mock state. |
| Store/commerce data plane | Cloudflare D1 `qabs-stores-db` and related Workers | Do not merge with portal databases by name alone. |
| Forms/notification intake | Cloudflare D1 `qabs-forms-db` and its Worker | Separate ownership until schemas and relationships are matched. |
| Formation/portal staging data | Cloudflare D1 `qabs-digital-portal-staging-db` | Staging data plane; migration requires counts, relationship checks, and rollback. |

## Verified repository boundary

- `src/data/mockData.ts` seeds the UI with demo records.
- `src/context/AppContext.tsx` manages core entities in React state; no production API call path was found in `src` during this audit.
- `DATABASE_SCHEMA.sql` describes a PostgreSQL-style target schema but is not wired to the current Vite app runtime.
- The CI path now uses Node 20 and pins `esbuild` to `0.28.2`, which resolves the Vite 8 peer-dependency failure. A committed npm lockfile is still required before switching CI to `npm ci`.

## Change controls

- No DNS, Shopify checkout, production payment, or real financial transaction changes are authorized by this map.
- Back up data and record a reversible migration before any schema or tenant consolidation.
- Treat staging, demo, portal, and Shopify as separate environments until an explicit cutover decision is approved.
