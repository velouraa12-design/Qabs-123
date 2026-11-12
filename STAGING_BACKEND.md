# QABS Staging Backend Contract

This document describes the real, isolated staging contract for `Qabs-123`. It is not a production deployment statement.

## Runtime and source of truth

- Frontend source: `Qabs-123`, branch `main` plus the backend contract branch.
- Staging API: `https://staging.qabs1.store`.
- Worker: `qabs-isolated-staging-worker-staging`.
- D1: `qabs-isolated-staging-db-20261110`.
- R2: `qabs-isolated-staging-artifacts-20261110`.
- The existing portal/stores D1 databases were not merged or migrated.
- The previous Worker version is retained as the rollback target; no production resources, DNS, Shopify, Checkout, or payment credentials were changed.

## Authentication

- `POST /api/auth/signup` — creates a staging user and session cookie.
- `POST /api/auth/login` — verifies the PBKDF2 password and creates a session cookie.
- `GET /api/auth/me` — returns the authenticated user or `null`.
- `POST /api/auth/logout` — invalidates the current session.
- Password recovery and email verification are intentionally not claimed as complete: no mail delivery integration is wired in this staging contract.

## Tenant-scoped platform API

All `/api/platform/*` routes require the secure staging session cookie. A first authenticated user receives a private tenant; membership is keyed by user ID, never by email matching. Every query includes the authenticated tenant ID.

- `GET /api/platform/me` — authenticated user and tenant membership.
- `GET /api/platform/requests` — list requests for the current tenant.
- `POST /api/platform/requests` — validates `kind`, `attempt_id`, and bounded JSON payload; idempotent on `(tenant_id, attempt_id)`.
- `GET /api/platform/requests/:id` — tenant-scoped request lookup.
- `POST /api/platform/requests/:id/messages` — tenant-scoped message creation.
- `POST /api/platform/requests/:id/status` — restricted to `admin`, `operations`, or `super_admin` roles.

Persisted staging tables are prefixed `staging_`: tenants, tenant members, requests, request messages, and audit events. The API returns truthful error states and does not report a local-only success when the staging API is enabled.

## Frontend integration

Set `VITE_QABS_API_BASE_URL=https://staging.qabs1.store` for a preview that should use the staging auth contract. `src/services/qabsStagingApi.ts` is opt-in so the public main preview is not silently pointed at a live staging database. When enabled, the auth modal blocks local success if the API rejects login/registration; recovery remains explicitly unavailable until a real mail provider is connected.

## Verification

The staging smoke suite verified health, unauthenticated rejection, signup, session lookup, tenant creation, request persistence, idempotent replay, cross-tenant list/read/message rejection, customer status-update rejection, message persistence, and logout invalidation. Credentials used for the smoke suite were ephemeral and are not stored in this repository.


## Staging commerce, files, billing, and operations

The deployed isolated Worker now also exposes the following tenant-scoped routes. No route enables real payment collection.

- `GET/POST /api/platform/documents` — list and upload bounded files to the isolated R2 bucket.
- `GET /api/platform/documents/:id` — stream a document only when it belongs to the authenticated tenant.
- `GET/POST /api/platform/stores` — list and create draft stores.
- `GET/POST /api/platform/stores/:storeId/products` — list and create products with SKU, price, and stock validation.
- `GET/POST /api/platform/stores/:storeId/orders` — list and create staging orders; `paymentEnabled` is always `false`.
- `GET /api/platform/billing/summary` — returns the staging subscription, invoice list, and isolated AI credit balance.
- `POST /api/platform/billing/credits/consume` — consumes test credits without charging money.
- `POST /api/platform/ai/usage` — records AI usage and consumes isolated test credits.
- `GET /api/platform/admin/summary` — tenant-scoped operational counters for authorized admin/operations users.
- `GET/POST /api/platform/staff` — list and assign existing staging users to tenant roles.

All new records and objects are tenant-scoped and audited. The Worker source is preserved in `staging-worker/`; deploys use the approved D1/R2 bindings and a current-version guard.

## Current limitations

Email verification and password recovery remain blocked until a real email provider is connected to Staging with approved credentials and delivery tests. The QABS AI route records usage and credits but does not claim a production model provider.
