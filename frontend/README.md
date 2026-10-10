# Gate frontend

An interactive, browser-persisted demo based on the approved authorization-queue reference. The backend is not required and no payment is executed.

## Run locally

Use Node.js 22.12+ (developed with Node 24) and npm.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The default route opens Transactions with GitHub selected. Vite supports direct navigation to each application route.

```sh
npm run build
npm run preview
npm test
npm run test:browser
```

Browser tests use a locally installed Google Chrome through Playwright; no browser download is necessary. They exercise saved workflows and capture the four approved viewport widths in `.impeccable/review/`.

## Verification

The production build and TypeScript checks pass, along with seven data-service tests and seven browser tests. Visual captures cover 1672×941, 1440×941, 1024×941, and 390×844, with additional full-page captures for Overview, Policies, Audit log, and Settings. Browser checks cover persistence, policy evaluations, decisions, audit entries, confirmed reset, corrupt storage recovery, and keyboard/focus behavior across the detail-panel breakpoint.

The independent Impeccable review returned `ship` for its three corrected findings: invisible vendor artwork spacing, removal of the redundant policy-editor label, and responsive detail-panel focus/scroll handling. The missing merchant assets remain the documented visual dependency below.

## Demo behavior

- Starts with 24 requests: 18 approved, 3 pending, 3 blocked, plus ten Gatekeepers with different original character portraits.
- Name, description, portrait, and optional department can be saved for a Gatekeeper. Portrait reuse is allowed. Pausing disables new requests without deleting history.
- Create requests from Overview or the Requests tab. Amounts are stored as integer USD cents. Saved local policies return Approved, Pending, or Blocked; pending requests accept one human review decision with a reason.
- Policy edits apply to future requests only. Existing requests retain their evaluation snapshot and evidence.
- Counts, Overview metrics, request history, and Audit log share one state. Settings update the visible profile/workspace and feedback preferences.
- Data persists under `gate.demo.v1` in this browser. Settings includes a confirmed reset. Failed saves do not update state; malformed saved data is retained until explicit reset.

## Backend connection later

`src/types.ts` defines `DemoDataService`. `src/service.ts` implements its asynchronous operations with local storage; `src/context.tsx` owns loading, saving, and error feedback. Replace the service implementation when APIs are available, keeping the page components and domain types. There are no fabricated endpoints or backend changes in this build.

When hosting the production build, configure SPA fallback to `index.html` for the application routes.

## Original artwork and pending logos

`ASSETS.json` records the source of every supplied image. Character PNGs and the rainbow logo retain the original bytes; circles are CSS crops. The rainbow logo is used only in the top-left navigation branding.

Merchant logo files are awaiting user delivery: GitHub, Delta, GiftCards.com, Google Ads, AWS, Deel, Notion, Stripe, FedEx, Linear. No merchant artwork is drawn, substituted, or downloaded. Their layout space remains reserved without displaying replacement graphics. Once provided, store the files under `public/assets/merchants/` and set each merchant's `logo` path in `src/data.ts`.

The supplied screenshot remains the visual authority. The exact merchant artwork is the remaining dependency for completing those placements. Self-hosted Inter and Phosphor pictograms approximate the reference's type and interface glyphs.

## Connected workspace

Open `/live` for the real backend workflow; the designed demo remains separate.
Run `./run-gate.sh` from the repository root for coordinated API/frontend ports.
The local API proxy uses `GATE_API_URL` (default http://127.0.0.1:8000).
See [integration flow](../backend/docs/integration-flow.md) for independent operator/finance testing and production HTTPS requirements.
