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

## Character animation

Every Gatekeeper uses the shared curved-eyelid rig, slow glances, blinking and subtle eye-pair sway. An initial motion style (float, drift, gentle turn, or breathe) is assigned from the agent ID; subsequent turns rotate actions through the shared scheduler. Ground and body currently move as a portrait; rotation is limited to 1.2 degrees. The character with glasses keeps its frames and bridge fixed while its pupils blink.

Open `/animation-preview` (or “Try the animated character” on Gatekeepers) and choose any of the ten characters. The preview provides look left/right, blink, wink, eyes closed, pointer-following gaze, and pause/resume at 440px and 112px. Transactions and Overview show 52px animated agent portraits, up from 36px. Gatekeeper cards retain their larger portraits.

Original PNGs remain intact. Generated clean plates repair only the feathered eye regions; provenance and exact prompts are stored beside each plate. Motion pauses offscreen, in hidden tabs and for paused Gatekeepers. Reduced motion allows direct expressions with no ambient spatial motion. Suspension preserves the timeline and current pose.

Validation: `npm run build`, `npm run test`, and `npm run test:browser -- tests/browser/animation.spec.ts`.

Ambient animation is coordinated across the page: one visible portrait plays one finite action, followed by 3–4 seconds of stillness. Each agent has a 3-second cooldown, including duplicate rows, and changes action on its next turn. Idle eye scanning and automatic blink loops are disabled in the UI; preview controls remain available on demand. Offscreen, paused and reduced-motion portraits are excluded.
