# QABS phase 2: isolated backend candidate

This branch is a development candidate based on commit d2250360d4f1bec01c9c9c0cb151edf231758b46. It has not been deployed to staging or production, and the existing preview is not evidence of this branch running.

## Scope

- Harden session cookie parsing and sign-in failure handling; handle concurrent registration collisions.
- Require authentication before commerce/platform schema setup; restrict staff enumeration; add nosniff to private downloads.
- Make tenant creation and request plus audit writes atomic; reject a request idempotency key reused for a different user, type or payload.
- Add SQLite and local workerd D1/R2 emulator integration tests to CI. The test-only SQL hook is bundled in memory by the test harness; never deploy that bundle.
- The credit transaction/idempotency implementation was already present at the base commit; tests exercise it, but the existing deployed staging worker was observed to use different, older code.

## Limitations and release gates

Local emulators do not prove behavior of remote D1, R2, service bindings, production or staging. Email verification, password recovery and external email delivery remain unverified/unavailable. Billing summary currently has write side effects; safe GET semantics require a separate fix and tests. Role coverage and security are not exhaustive.

Do not deploy or run migrations against an existing database until there is a verified recoverable backup, an approved non-disruptive plan, and confirmed environmental isolation. D1 export can block requests. Do not modify the production-connected commerce binding without a separately approved safe plan. No existing customer data or objects were modified by these tests.

## Local checks

Run `npm install --no-package-lock --ignore-scripts --legacy-peer-deps`, `npm run lint`, `npm run test:credits`, `npm run test:backend`, `npm run build`, and `node --test tests/preview-worker.test.mjs`. The backend tests use disposable synthetic accounts and in-memory local emulators, not remote services.

The repository has no committed package lock; the CI install therefore does not guarantee identical transitive dependencies between runs. Miniflare itself is pinned exactly. A lockfile and a reproducible install remain a follow-up release gate.
