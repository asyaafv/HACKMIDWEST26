---
name: Gate
description: A navy authorization workspace grounded in the supplied dashboard and original artwork.
colors:
  bg: "#1d1e22"
  sidebar-bg: "#18191d"
  surface: "#343232"
  surface-raised: "#3e3d40"
  border: "#46454a"
  text: "#f4f4f5"
  secondary: "#b8b8be"
  muted: "#a4a4ac"
  green: "#acc6b4"
  red: "#d5aaa6"
  amber: "#efa36d"
  action: "#efa36d"
  action-text: "#202124"
  action-hover: "#f7b989"
  button-bg: "#35353a"
  button-hover: "#45454b"
  field-bg: "#29292e"
  field-border: "#5b5b63"
  focus: "#efa36d"
  container-bg: "#343232"
  container-border: "#46454a"
  selected-row: "#403024"
  approved-text: "#acc6b4"
  approved-bg: "#28352c"
  pending-text: "#efa36d"
  pending-bg: "#403024"
  blocked-text: "#d5aaa6"
  blocked-bg: "#3a2b2b"
  orange: "#efa36d"
  orange-hover: "#f7b989"
  orange-bg: "#403024"
  orange-border: "#98633f"
typography:
  display:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  page-title:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  field:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  amount:
    fontFamily: "Open Sans, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
rounded:
  badge: "6px"
  field: "7px"
  control: "8px"
  search: "9px"
  evidence: "10px"
  container: "12px"
  dialog: "14px"
  portrait: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  page-inline: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.button-bg}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
  input:
    backgroundColor: "{colors.field-bg}"
    textColor: "{colors.text}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
  status-approved:
    backgroundColor: "{colors.approved-bg}"
    textColor: "{colors.approved-text}"
    rounded: "{rounded.badge}"
    padding: "5px 11px"
  status-pending:
    backgroundColor: "{colors.pending-bg}"
    textColor: "{colors.pending-text}"
    rounded: "{rounded.badge}"
    padding: "5px 11px"
  status-blocked:
    backgroundColor: "{colors.blocked-bg}"
    textColor: "{colors.blocked-text}"
    rounded: "{rounded.badge}"
    padding: "5px 11px"
  card:
    backgroundColor: "{colors.container-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "21px 21px 15px"
---

# Design System: Gate

## Cinematic welcome

The user-authorized entrance is an Experience surface over the unchanged workspace. On each document visit, a 5.8-second procedural Three.js scene places a 3D interpretation of the rainbow logo behind a low-poly stone arch and iron portcullis. The surrounding workspace is temporarily dimmed and inert. Bright green binary rain fills the entire viewport behind the gate, with 22px digits on desktop and 18px digits on mobile. The center is quieter to keep the gate and mascot as the focal point. The rain and the mascot's eye reflections share an animation clock. The reflections span the area inside each white eye ring as a transparent overlay: five columns of smaller green digits with contrasting outlines, scrolling roughly three times faster at 62% opacity, with no dark backing, preserving the pupils, white highlights, and rainbow colors underneath. The mascot looks left, blinks, looks right, receives a decorative Approved check, passes through the rising gate, and immediately shrinks into the existing header logo on desktop, with both eyes open and no forward enlargement or wink. Mobile uses a centered shrink and fade. The mascot matches the original icon’s saturated diagonal bands, larger circular white eye rings, black capsule pupils, and centered white capsule highlights. This intro is the authorized exception to the header-only logo rule; the supplied raster remains intact.

One elapsed-time timeline controls every phase. Normal routing does not replay the welcome; refresh, new document visits, and back-forward-cache restoration do. Skip intro and Escape release the workspace immediately. Reduced motion and graphics failure receive a 700 ms static welcome. Initialization has a one-second deadline. Audio is one best-effort synthesized ding; browser-blocked audio never plays later. No payment, policy, or transaction is approved by the decorative scene. GPU resources, listeners, rendering, and audio are released on exit.

The entrance shares the original dark matte intro tokens, independent of the light workspace palette, with user-authorized green binary rain and eye reflections. Stone and iron use gray materials with full roughness and zero metalness, with neutral lighting. The backdrop is a solid color. Decorative glow, haze, particles, light trails, colored lights, and workspace blur are removed. The original rainbow mascot remains intact. The approval label is 16px, the skip control 12px, and its nonessential Esc hint 10px.

## Overview

**Creative North Star: "The Authorization Workspace"**

Gate uses the user-supplied dark dashboard as visual authority: navy surfaces, pale supporting text, pale yellow Open Sans headings, thin separators, and compact decision badges. The interface stays dense enough to scan transactions while keeping the selected request and its business evidence readable.

The supplied rainbow logo and ten character portraits carry the identity. Original raster bytes remain unchanged; circular crops happen in CSS. This is an extraction of the finished React implementation, not permission to invent a new visual direction. The approved navigation and page name is Gatekeepers; the transaction table retains its Agent column.

**Key Characteristics:**

- Navy and blue tonal layers and thin structural separators.
- Strong Open Sans headings above compact labels and numerical data.
- Pale yellow primary actions; semantic color for decisions and risk.
- Original artwork, circular portraits, and a persistent shared shell.
- Selected transaction rows synchronized with an inspectable detail panel.

## Colors

The user-approved palette is navy, blue, teal, and pale yellow, with pale supporting text for contrast. All interface surfaces use solid colors; gradients, glows, decorative blur, and shadows are excluded.

### Primary

- **Pale Neutral Action:** `action`, `action-text`, and `action-hover` distinguish create, save, and approve controls.
- **Clear Foreground:** `text` carries the strongest readable content and selected-tab underlines.

### Secondary

- **Neutral Gray Support:** `secondary` carries navigation labels, subtitles, metadata, and supporting explanation. It is a text role, not a second call-to-action accent.

### Tertiary

- **Decision Green, Review Amber, and Block Red:** `green`, `amber`, and `red` carry semantic feedback. The paired `approved-*`, `pending-*`, and `blocked-*` tokens specify the compact decision badges. Priority badges use muted solid colors; risk chips use their own tonal status treatment from the source stylesheet.

### Neutral

- **Near-black Ground:** `bg` is the root background; `surface` and `surface-raised` describe neutral surface steps.
- **Charcoal Containers:** `container-bg` and `container-border` frame Gatekeeper cards and policy editing.
- **Quiet Structure:** `border` divides the shell, rows, tabs, and evidence.
- **Muted Gray:** `muted` carries tertiary helper text and timestamps.
- **Open Sansaction Surfaces:** `button-bg`, `button-hover`, `field-bg`, `field-border`, and `selected-row` distinguish usable controls and selection without introducing a brand accent.
- **Keyboard Focus:** `focus` supplies the visible outline.

**The Neutral Action Rule.** Primary new-action controls use the pale yellow treatment; approval green, pending amber, and blocking red describe semantic state.

## Typography

**Display Font:** Open Sans, with sans-serif fallback.
**Body Font:** Open Sans, with sans-serif fallback.

**Character:** One self-hosted family supplies weights (400–700). Bold compact headings establish the page; medium labels and pale supporting text make dense records readable. Amounts, counts, and risk values use tabular numerals.

### Hierarchy

- **Display:** The authorization queue heading uses `display`; it reduces to (32px) on mobile.
- **Page title:** Other page headings use `page-title`; they reduce to (30px) on mobile.
- **Headline / Title:** `headline` is the base section heading; `title` is the detail section heading. Specific card headings and dialog headings retain their observed component sizes.
- **Body:** `body` describes explanatory detail text. Forms use `field`. Table content uses (14px), and table headings use (13px) at weight (600).
- **Label:** `label` describes button labels. Sidebar navigation uses (15px) at weight (400).
- **Amount:** `amount` makes the selected transaction value dominant; it stays (28px) on mobile. Table amounts use (16px) at weight (700).

**The Single Family Rule.** Use the shipped self-hosted Open Sans family for headings, content, and controls; preserve numerical alignment in monetary and count fields.

## Layout

The desktop shell has a fixed sidebar (240px) and fixed topbar (70px). The content starts after these dimensions. At widths of (1536px) and above, an open transaction panel occupies a second grid column (456px); the panel is sticky below the topbar and scrolls independently. The queue uses inline padding (32px), dense rows (61px), and thin separators. The default table minimum is (900px), so limited-width queue space scrolls horizontally.

Below (1536px), details become a fixed right overlay with a dim backdrop. Overlay mode traps keyboard focus, locks background scrolling, supports Escape, and restores focus on close. Media changes update this behavior while the panel remains open. Below (1200px), the sidebar reduces to (220px) and page inline padding to (24px). Below (1024px), navigation becomes a dismissible drawer (240px) and the content sidebar offset becomes zero.

Below (768px), page inline padding becomes (18px); toolbars wrap, headings stack, metrics become two columns, and policy and settings layouts become one column. The detail panel becomes `min(456px, 100vw)` with square outer corners. The transaction table remains horizontally scrollable with minimum width (910px); do not force columns into unreadable mobile cards. Compact preference reduces desktop rows to (50px). Gatekeeper grids progress from four to three to two columns, then one below (360px).

Spacing is component-specific and compact; the frontmatter records recurring steps rather than claiming a universal grid that the source does not use. Large containers separate with layout, borders, and moderate padding rather than repeated nested cards.

**The Queue Continuity Rule.** Keep the selected row and detail content synchronized, and preserve the queue around the request inspection flow.

## Elevation & Depth

All surfaces are matte, differentiated by solid neutral tones and thin borders. Floating layers use borders and opaque backgrounds without shadows or glows. Layer order is shell (10), dropdown (25), detail backdrop (30), overlay (40), navigation (50), toast (70); native dialogs occupy the browser top layer.

**The Matte Surface Rule.** Use solid backgrounds and thin borders for both ordinary content and transient layers. No gradients, shadows, glows, or decorative blur.

## Shapes

Controls use gentle compact corners; chips, risk values, and priority badges are tighter. Cards use `container`, dialogs use `dialog`, evidence rows use `evidence`, and fields use `field`. Portraits and the supplied logo use `portrait` with `object-fit: cover`; merchant artwork uses containment when supplied. Selected table rows round only the outer cells. The desktop detail panel rounds its left corners (15px) and the mobile overlay removes this radius.

## Components

### Buttons

Compact and neutral. The primary and secondary treatments use frontmatter tokens with minimum height (40px), inline icon/text gap (8px), and a (1px) border. Secondary hover lightens the surface and border. Danger controls use the existing dark red surface and pale red text. Disabled controls lower opacity to (0.45). All button state transitions use (150ms ease); visible keyboard focus uses a (2px) outline offset (4px).

### Chips

Decision badges combine a written status with the paired semantic background and text colors. They use minimum height (30px), font size (13px), and weight (700). The large panel status uses a stronger border, minimum height (46px), and (10px) corners. Count badges are compact neutral blocks with tabular figures; do not treat counts as status colors.

### Cards / Containers

Gatekeeper cards and the policy editor share the neutral container surface, thin border, and container radius. Gatekeeper cards use the frontmatter padding and no resting shadow. Portrait, title, department, description, and separated footer form the hierarchy. Overview metrics and audit records stay divided by lines rather than becoming redundant cards.

### Inputs / Fields

Navy fields use the frontmatter input treatment, full available width, (1px) borders, and labels above the field. Focus lightens the border to `#ceddcc` while the visible outline remains available. Search fields are integrated into compact icon-bearing shells; their border brightens on focus-within. Error text appears beside a Phosphor warning icon. Busy form actions disable until saving completes.

### Navigation

Sidebar items use pale supporting text, compact icons, minimum height (46px), and control-radius corners. Hover lifts the surface; active items use a solid gray surface, pale yellow text, and a pale left border. Preserve the supplied logo plus Gate only at the top-left. Use the single shipped Phosphor family, regular by default, with the existing filled semantic checks. Page and queue tabs use a pale yellow bottom stroke for selection.

### Transaction Inspection

Selected rows lift to `selected-row`. The detail panel repeats the merchant, amount, status, tabs, metadata, evidence, policy checks, and decision reason. Evidence rows use compact rounded borders and written source labels, without decorative nodes or timeline lines. Panel opening and native dialog opening use (180ms) with `cubic-bezier(.16,1,.3,1)` and an (8px) entry translation. Reduced-motion preference removes animation and transitions.

### Artwork

Reuse the ten supplied originals as circular portraits; never regenerate or redraw them. Table portraits default to (52px), Gatekeeper card portraits to (112px), reducing to (94px) on mobile. Keep the raster provenance in `ASSETS.json` and adjacent `.png.origin.json` files. Merchant logos use original files fetched from official company websites, with source URLs and hashes recorded in ASSETS.json and adjacent origin files; never reconstruct or recolor them. GitHub uses a white backing with 3px padding; AWS uses a navy backing with 3px padding to preserve its original white lettering on light surfaces. The vendor evidence icon shell is transparent when artwork is missing; reserve space without a visible placeholder.

## Do's and Don'ts

### Do:

- **Do** preserve the approved solid navy and blue surfaces, Open Sans hierarchy, separators, and compact density.
- **Do** use pale yellow primary actions and written labels alongside decision colors.
- **Do** preserve the original logo and ten portraits, using CSS circular crops and retaining asset provenance.
- **Do** preserve responsive overlay focus, scrolling, and queue selection behavior when extending inspection screens.
- **Do** reuse the shared shell, the shipped Phosphor family, and the existing component states.

### Don't:

- **Don't** replace supplied artwork, add generated asset substitutes, or introduce an unapproved visual direction.
- **Don't** repeat the rainbow logo outside the top-left brand.
- **Don't** fill missing merchant imagery with substitute graphics, monograms, or visible placeholder boxes.
- **Don't** squeeze the transaction table into illegible columns on mobile; retain horizontal scrolling.
- **Don't** add redundant decorative eyebrows to form or section headings.

## Authorized character animation

All ten supplied originals remain intact. User-approved generated clean plates reconstruct only feathered eye regions for independent curved eyelids and pupil movement. Character 07 retains its eyeglass frames and bridge. Agents receive stable randomized drift, turn, breathe and eye actions with staggered timing; spatial movement scales down with portrait size. Selected transaction portraits add a stronger float independently of their ambient actions. Transactions and Overview use 52px portraits. Gatekeeper portraits remain 112px (94px on mobile). Motion stops offscreen, when the document is hidden, when an agent is paused, and under reduced motion. `/animation-preview` lets the user inspect each character.

## Decision-first workspace

Overview is the home screen. Its first section is a full-width decision summary with the pending count, total amount, pale yellow Review next request action, and up to three preview rows. Metrics and historical activity follow. Pending attention uses a solid neutral surface (`#003161`), border and separators (`#006a67`), and pale supporting text (`#ceddcc`). Muted amber is reserved for the review icon and compact status badges. The summary heading is 22px (20px on mobile). At zero pending requests, a compact neutral caught-up state replaces the attention section.

Needs a decision sits beneath Overview in navigation, using a compact 14px label to accommodate its count within the existing sidebar. Its neutral count badge uses the button surface and primary text, and disappears at zero. `/decisions` reuses the transaction workspace, all pending records without a date cutoff, and priority/oldest-first ordering. Saved decisions advance to the next item and announce completion independently of toast preferences. Preview rows stack their identity, priority, waiting duration, amount, and explicit Review action on mobile. Attention cues remain static.

### Quiet animation turns

Ambient animation runs independently for each visible agent, with staggered first turns within one second and 3–4 seconds of rest between actions. Duplicate rows share an identity cooldown. Actions rotate through drift, tilt, breathe, nod, lean, look around, look left, look right, blink, wink and a relaxed both-eyes-closed pose. Floating is reserved for selected transaction portraits and the explicit Float toggle in the preview; it uses a separate 3.6-second sine-like bob with 4–18px travel per direction, scaled to portrait size. Eye and other ambient actions continue independently while floating. Deselection removes the bob immediately; pause, offscreen, hidden-tab and reduced-motion states stop it. The relaxed pose closes over 140 ms, holds for one second, and reopens over 260 ms. Offscreen, paused and reduced-motion portraits stay still; preview controls remain available.

## Current user palette

The latest user palette supersedes the previous palette: navy #000B58, blue #003161, teal #006A67, and pale yellow #FFF4B7. Navy is the canvas and field background; blue is the sidebar and panel surface; teal marks raised surfaces, selection, and approval; pale yellow carries headings, primary actions, and focus. Supporting text uses a pale palette tint; errors retain a readable warm semantic tint. Primary actions use navy text on pale yellow.

The green binary intro retains its dark canvas, original green 0s and 1s, and eye reflections. Original logo, portraits, and merchant artwork keep their original colors. Metadata and evidence omit decorative dots; heading colors remain consistent.

## Orange secondary color

Orange (#efa36d) is the site’s secondary brand color over the unchanged charcoal canvas and gray panels. It carries primary actions, active navigation and tabs, inline action links, profile controls, checkbox selection, keyboard focus, field focus borders, and pending/P1 badges. Active navigation, filters, selected transaction rows, and policy rows use a deep orange surface (#403024). Orange hover states lighten to #f7b989. Primary orange fills use dark text (#202124); ordinary text and headings remain neutral. Approval and blocking keep their semantic green and red. Original artwork and the green binary intro retain their colors.

## Button interaction feedback

Hover feedback covers every native button and button-like action link. Action buttons scale to 1.025 with a 1px lift; small icon controls scale to 1.075, compact filters to 1.035, and wide row/sidebar controls to 1.008 without lifting. Tabs scale to 1.02 from their lower edge, keeping the selection underline anchored. Text actions scale to 1.015 and their directional icons move 2px. Motion uses a 220ms decelerating entry and 160ms return; existing matte colors and keyboard focus remain intact. Fine-pointer hover gating avoids sticky touch scaling. Disabled controls receive no hover treatment. Reduced motion removes spatial changes and transitions while retaining existing color feedback.

Gatekeeper cards expose a full-card native button that opens read-only backend agent details and links to that agent’s requests. Agent creation, editing, and pause/resume are managed through backend identity provisioning. Fine-pointer hover scales each card to 1.015 with a 3px lift and enlarges its portrait to 1.055. Hovering the agent identity in the shared Overview/Transactions table enlarges its portrait to 1.1 with a 2px lift. Independent CSS scale/translate properties preserve the existing ambient and selected-float transforms. Keyboard focus outlines the full card, dialog dismissal returns focus to its opener, and reduced motion removes spatial feedback.
