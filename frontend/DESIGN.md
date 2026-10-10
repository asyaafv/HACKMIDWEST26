---
name: Gate
description: A dark authorization workspace grounded in the supplied dashboard and original artwork.
colors:
  bg: "#0b1217"
  surface: "#101820"
  surface-raised: "#17222d"
  border: "#1e2b36"
  text: "#f4f5f7"
  secondary: "#bdd5ee"
  muted: "#90a7bd"
  green: "#4ef0a8"
  red: "#ff6259"
  amber: "#ffd447"
  action: "#edf3f8"
  action-text: "#111b23"
  action-hover: "#d1e0ed"
  button-bg: "#14212b"
  button-hover: "#243747"
  field-bg: "#0b151d"
  field-border: "#344554"
  focus: "#c5e1ff"
  container-bg: "#111b24"
  container-border: "#263440"
  selected-row: "#18232e"
  approved-text: "#64f5b3"
  approved-bg: "#123428"
  pending-text: "#ffd340"
  pending-bg: "#302a12"
  blocked-text: "#ff645b"
  blocked-bg: "#351d1e"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "45px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  field:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  amount:
    fontFamily: "Inter, sans-serif"
    fontSize: "40px"
    fontWeight: 800
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

## Overview

**Creative North Star: "The Authorization Workspace"**

Gate uses the user-supplied dark dashboard as visual authority: cool near-black surfaces, pale blue supporting text, white Inter headings, thin separators, and compact decision badges. The interface stays dense enough to scan transactions while keeping the selected request and its business evidence readable.

The supplied rainbow logo and ten character portraits carry the identity. Original raster bytes remain unchanged; circular crops happen in CSS. This is an extraction of the finished React implementation, not permission to invent a new visual direction. The approved navigation and page name is Gatekeepers; the transaction table retains its Agent column.

**Key Characteristics:**

- Dark tonal layers and thin structural separators.
- Strong Inter headings above compact labels and numerical data.
- Pale neutral primary actions; semantic color for decisions and risk.
- Original artwork, circular portraits, and a persistent shared shell.
- Selected transaction rows synchronized with an inspectable detail panel.

## Colors

The palette is cool and restrained; existing subtle gradients are part of the reference's material treatment.

### Primary

- **Pale Neutral Action:** `action`, `action-text`, and `action-hover` distinguish create, save, and approve controls.
- **Clear Foreground:** `text` carries the strongest readable content and selected-tab underlines.

### Secondary

- **Pale Blue Support:** `secondary` carries navigation labels, subtitles, metadata, and supporting explanation. It is a text role, not a second call-to-action accent.

### Tertiary

- **Decision Green, Review Amber, and Block Red:** `green`, `amber`, and `red` carry semantic feedback. The paired `approved-*`, `pending-*`, and `blocked-*` tokens specify the compact decision badges. Existing priority badges use separate warm gradients; risk chips use their own tonal status treatment from the source stylesheet.

### Neutral

- **Near-black Ground:** `bg` is the root background; `surface` and `surface-raised` describe cool surface steps.
- **Container Slate:** `container-bg` and `container-border` frame Gatekeeper cards and policy editing.
- **Quiet Structure:** `border` divides the shell, rows, tabs, and evidence.
- **Muted Blue-gray:** `muted` carries tertiary helper text and timestamps.
- **Interaction Surfaces:** `button-bg`, `button-hover`, `field-bg`, `field-border`, and `selected-row` distinguish usable controls and selection without introducing a brand accent.
- **Keyboard Focus:** `focus` supplies the visible outline.

**The Neutral Action Rule.** Primary new-action controls use the pale neutral treatment; approval green, pending amber, and blocking red describe semantic state.

## Typography

**Display Font:** Inter, with sans-serif fallback.
**Body Font:** Inter, with sans-serif fallback.

**Character:** One self-hosted family supplies weights (400–800). Heavy compact headings establish the page; medium labels and pale supporting text make dense records readable. Amounts, counts, and risk values use tabular numerals.

### Hierarchy

- **Display:** The authorization queue heading uses `display`; it reduces to (32px) on mobile.
- **Page title:** Other page headings use `page-title`; they reduce to (30px) on mobile.
- **Headline / Title:** `headline` is the base section heading; `title` is the detail section heading. Specific card headings and dialog headings retain their observed component sizes.
- **Body:** `body` describes explanatory detail text. Forms use `field`. Table content uses (14px), and table headings use (13px) at weight (600).
- **Label:** `label` describes button labels. Sidebar navigation uses (17px) at weight (600), reducing to (15px) below the narrower desktop breakpoint.
- **Amount:** `amount` makes the selected transaction value dominant; it reduces to (36px) on mobile. Table amounts use (16px) at weight (700).

**The Single Family Rule.** Use the shipped self-hosted Inter family for headings, content, and controls; preserve numerical alignment in monetary and count fields.

## Layout

The desktop shell has a fixed sidebar (240px) and fixed topbar (70px). The content starts after these dimensions. At widths of (1536px) and above, an open transaction panel occupies a second grid column (456px); the panel is sticky below the topbar and scrolls independently. The queue uses inline padding (32px), dense rows (61px), and thin separators. The default table minimum is (900px), so limited-width queue space scrolls horizontally.

Below (1536px), details become a fixed right overlay with a dim backdrop. Overlay mode traps keyboard focus, locks background scrolling, supports Escape, and restores focus on close. Media changes update this behavior while the panel remains open. Below (1200px), the sidebar reduces to (220px) and page inline padding to (24px). Below (1024px), navigation becomes a dismissible drawer (240px) and the content sidebar offset becomes zero.

Below (768px), page inline padding becomes (18px); toolbars wrap, headings stack, metrics become two columns, and policy and settings layouts become one column. The detail panel becomes `min(456px, 100vw)` with square outer corners. The transaction table remains horizontally scrollable with minimum width (910px); do not force columns into unreadable mobile cards. Compact preference reduces desktop rows to (50px). Gatekeeper grids progress from four to three to two columns, then one below (360px).

Spacing is component-specific and compact; the frontmatter records recurring steps rather than claiming a universal grid that the source does not use. Large containers separate with layout, borders, and moderate padding rather than repeated nested cards.

**The Queue Continuity Rule.** Keep the selected row and detail content synchronized, and preserve the queue around the request inspection flow.

## Elevation & Depth

Ordinary surfaces are flat, differentiated by tones, faint gradients, and thin borders. Shadows signal transient layers: workspace and search popovers, detail overlays, native dialogs, and toasts. The desktop detail panel has no overlay shadow. Layer order is shell (10), dropdown (25), detail backdrop (30), overlay (40), navigation (50), toast (70); native dialogs occupy the browser top layer.

### Shadow Vocabulary

- **Workspace popover:** `0 12px 32px #0005`.
- **Search results:** `0 20px 40px #0008`.
- **Detail overlay:** `-15px 10px 35px #0004`.
- **Dialog:** `0 24px 90px #0008`.
- **Toast:** `0 10px 30px #0005`.

**The Transient Depth Rule.** Preserve shadow-free ordinary content and reserve diffuse shadows for the shipped floating layers.

## Shapes

Controls use gentle compact corners; chips, risk values, and priority badges are tighter. Cards use `container`, dialogs use `dialog`, evidence rows use `evidence`, and fields use `field`. Portraits and the supplied logo use `portrait` with `object-fit: cover`; merchant artwork uses containment when supplied. Selected table rows round only the outer cells. The desktop detail panel rounds its left corners (15px) and the mobile overlay removes this radius.

## Components

### Buttons

Compact and neutral. The primary and secondary treatments use frontmatter tokens with minimum height (40px), inline icon/text gap (8px), and a (1px) border. Secondary hover lightens the surface and border. Danger controls use the existing dark red surface and pale red text. Disabled controls lower opacity to (0.45). All button state transitions use (150ms ease); visible keyboard focus uses a (2px) outline offset (4px).

### Chips

Decision badges combine a written status with the paired semantic background and text colors. They use minimum height (30px), font size (13px), and weight (700). The large panel status uses a stronger border, minimum height (46px), and (10px) corners. Count badges are compact neutral blocks with tabular figures; do not treat counts as status colors.

### Cards / Containers

Gatekeeper cards and the policy editor share the cool container surface, thin border, and container radius. Gatekeeper cards use the frontmatter padding and no resting shadow. Portrait, title, department, description, and separated footer form the hierarchy. Overview metrics and audit records stay divided by lines rather than becoming redundant cards.

### Inputs / Fields

Dark fields use the frontmatter input treatment, full available width, (1px) borders, and labels above the field. Focus lightens the border to `#b8d5ee` while the visible outline remains available. Search fields are integrated into compact icon-bearing shells; their border brightens on focus-within. Error text appears beside a Phosphor warning icon. Busy form actions disable until saving completes.

### Navigation

Sidebar items use pale supporting text, compact icons, minimum height (46px), and control-radius corners. Hover lifts the surface; active items use a subtle slate gradient, white text, and a pale left border. Preserve the supplied logo plus Gate only at the top-left. Use the single shipped Phosphor family, regular by default, with the existing filled semantic checks. Page and queue tabs use a white bottom stroke for selection.

### Transaction Inspection

Selected rows lift to `selected-row`. The detail panel repeats the merchant, amount, status, tabs, metadata, evidence, policy checks, and decision reason. Evidence rows use a connected vertical line and small nodes, compact rounded borders, and written source labels. Panel opening and native dialog opening use (180ms) with `cubic-bezier(.16,1,.3,1)` and an (8px) entry translation. Reduced-motion preference removes animation and transitions.

### Artwork

Reuse the ten supplied originals as circular portraits; never regenerate or redraw them. Table portraits default to (52px), Gatekeeper card portraits to (112px), reducing to (94px) on mobile. Keep the raster provenance in `ASSETS.json` and adjacent `.png.origin.json` files. Merchant logos use original files fetched from official company websites, with source URLs and hashes recorded in ASSETS.json and adjacent origin files; never reconstruct or recolor them. GitHub uses a white backing with 3px padding to preserve legibility on the dark surface. The vendor evidence icon shell is transparent when artwork is missing; reserve space without a visible placeholder.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied dashboard's cool dark surfaces, Inter hierarchy, separators, and compact density.
- **Do** use pale neutral primary actions and written labels alongside decision colors.
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

Overview is the home screen. Its first section is a full-width decision summary with the pending count, total amount, neutral primary Review next request action, and up to three preview rows. Metrics and historical activity follow. Pending attention uses an amber-tinted surface (`#211e14`), border (`#64512a`), separators (`#4a4029`), and warm supporting text (`#dfd3b8`); these are semantic review colors, not brand accents. The summary heading is 25px (22px on mobile). At zero pending requests, a compact neutral caught-up state replaces the attention section.

Needs a decision sits beneath Overview in navigation, using a compact 14px label to accommodate its count within the existing sidebar. Its amber badge uses the existing pending surface and amber text, and disappears at zero. `/decisions` reuses the transaction workspace, all pending records without a date cutoff, and priority/oldest-first ordering. Saved decisions advance to the next item and announce completion independently of toast preferences. Preview rows stack their identity, priority, waiting duration, amount, and explicit Review action on mobile. Attention cues remain static.

### Quiet animation turns

Ambient animation runs independently for each visible agent, with staggered first turns within one second and 3–4 seconds of rest between actions. Duplicate rows share an identity cooldown. Actions rotate through drift, tilt, breathe, nod, lean, look around, look left, look right, blink, wink and a relaxed both-eyes-closed pose. Floating is reserved for selected transaction portraits and the explicit Float toggle in the preview; it uses a separate 3.6-second sine-like bob with 4–18px travel per direction, scaled to portrait size. Eye and other ambient actions continue independently while floating. Deselection removes the bob immediately; pause, offscreen, hidden-tab and reduced-motion states stop it. The relaxed pose closes over 140 ms, holds for one second, and reopens over 260 ms. Offscreen, paused and reduced-motion portraits stay still; preview controls remain available.
