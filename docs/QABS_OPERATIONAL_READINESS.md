# QABS Operational Readiness — Staging / Public Preview

This document records the verified state of the current implementation. It does not authorize a production deploy or PR merge.

## Deployment boundaries

- Public preview: `https://preview.qabs1.store`
- Preview source baseline: `c31cc600ee56a188851d8e7db2ddd028eeff532e`
- Preview delivery: isolated Cloudflare Worker with synthetic-only static assets, not the production Pages project.
- Staging API: `https://staging.qabs1.store`
- Production, DNS, Shopify, Checkout, and real payments were not changed by this work.

## Verified in this pass

- Preview root returns HTTP 200 and advertises `x-qabs-preview-data: synthetic-only`.
- Preview HTML points to the latest hardened build.
- Preview JavaScript contains no `staging.qabs1.store` reference.
- Public preview hides internal navigation, role simulation, content editing, authentication UI, governance links, GitHub links, and CI labels.
- Direct requests to `/`, `/admin`, `/billing`, and `/portal` remain on the public landing view.
- Desktop and mobile browser checks passed with no horizontal overflow.
- Staging `/health` returns HTTP 200 without reading data or secrets.
- Unauthenticated `/api/platform/me` and `/api/platform/staff` return HTTP 401.
- Cross-origin preflight from the public preview to Staging is rejected with HTTP 403 `ORIGIN_NOT_ALLOWED`.
- `npm run lint`, `npm run build`, and `npm run build:preview` pass locally.

## Implemented safety changes

- Public preview route guard forces the landing view and does not mount internal dashboard/editor surfaces.
- Public preview build pins `VITE_QABS_ENV=preview` and clears `VITE_QABS_API_BASE_URL`.
- Staging staff listing requires an admin authorization check.
- Staging credit/AI debits verify the atomic D1 update result before reporting success.

## Not complete / blocked

- Email verification and password recovery are not connected to a real mail provider.
- Credentialed E2E cannot be rerun in the current environment because the approved admin/customer test credentials are not present; no credentials were guessed or created.
- Full tenant-isolation, RBAC, R2 document, commerce, billing, and AI E2E evidence requires those approved test accounts and the complete test matrix.
- Large parts of the UI still use mock data or local state when the corresponding API flow is not enabled.
- GitHub Advanced Security secret scanning is unavailable for this repository; local targeted pattern checks were run instead.
- PR #5 remains open and draft; it was not merged.

## Source commits

- `a16a0827cc0b3b013a0a761ca2e0cc360f396eee` — synthetic-only public preview build command.
- `8a26a94887ec6c581d7d8712d48e63bdc9272723` — staging authorization and atomic credit-debit hardening.
- `3d6adcc978a4e9613149d2ac61ec89b433a5f9f8` — public-preview route isolation.
- `a90856c5d06aaacfd4a9a8b80c5d70cb95a8d535` — customer-facing preview cleanup.

All commits above are on `hardening/public-preview-safe`, not merged into `main` or PR #5.
