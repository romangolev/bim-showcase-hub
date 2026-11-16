# DESIGN.md

Source: https://styles.refero.design/style/eeeb6ac9-fc07-4965-935a-e1989ed831f1 ("Default", Refero Styles).
This file is derived from the tokens published on that page. It is not Refero's official export, which requires their MCP connector.

## Mood

A calm, dark "control room" for infrastructure software. Near-black surfaces, hairline borders, light-weight type. Technical and understated, never promotional. Blue is the only brand accent and is used sparingly.

## Color

### Neutrals

| Token | Hex | Role |
|---|---|---|
| void | #0b0c0e | Page canvas, footer |
| graphite | #131416 | Cards, panels, table rows |
| charcoal | #1f1f21 | Secondary surfaces, inputs, borders, dividers |
| smoke | #3c3d3e | Button borders, subtle separators |
| steel | #71717a | Captions, helper text |
| fog | #858687 | Secondary text, icon strokes, inactive nav |
| ash | #9d9e9f | Tertiary text, placeholders, disabled |
| chalk | #cececf | Table cell text, secondary body text |
| snow | #ffffff | Headings and primary text |
| bone | #f2f2f2 | Primary CTA fill |
| ink | #333333 | CTA label text |

### Accents

| Token | Hex | Role |
|---|---|---|
| signal-blue | #3b82f6 | Active states, links, icon fills |
| arc-blue | #60a5fa | Light text accents, informational highlights |
| ring-blue | #93c5fd | Focus rings, selection outlines |
| mint | #4ade80 | Success badge text and outline |
| fern | #22c55e | Soft green washes |
| coral | #f87171 | Destructive and error text |
| ember | #ea580c | Decorative icon chip only |
| iris | #314ef0 | Brand chip tint in mockups |

Green and red are reserved for success and destructive signals. Never decorative.

## Typography

- Family: Inter variable, with `font-feature-settings: "ss01", "ss03"`.
- Headlines: weight 400 at 32px and above. Display sizes 52 to 64px.
- Body and UI: weights 420 to 480, sizes 13 to 18px. Weight 500 for small labels, 580 rarely.
- Scale: 8, 13, 14, 16, 18, 24, 32, 42, 52, 64px. The 24px step is the model page title.
- Tracking: about -0.02 to -0.03em at body sizes, slightly looser at display sizes.

## Spacing and shape

- Base unit 4px, compact density.
- Max content width 1080px. 96px between sections. 16px card padding, 12px panel padding. 8px element gap.
- App gutter between panes 12px, page gutter 16px. Summary table cells 6px by 8px.
- Radii: buttons and pills 8px, cards 8px, icon tiles 6px, badges 4px, large containers 12px.
- Hit targets are 32px on desktop and 44px on touch or at widths up to 700px.
- Density adaptation: these values are tighter than the Refero spec (which has 28px cards, 10px and 12px radii, 24px containers and a 72px bar) on purpose, to give the viewer more screen. Keep new components on the tokens.

## Elevation

Depth comes from 0.5px translucent white hairline borders and 1px inset white highlights. No cast shadows except on floating product mockups. Blue and green glows may be used as subtle focus or status rings.

## Components

- Primary button: bone fill, ink text, 8px radius, 14px text, light shadow. The only primary action style.
- Secondary button: translucent white ghost fill, white text.
- Text link: slightly transparent white, no padding or background.
- Status badge: transparent background, thin mint border, mint text, small dot prefix.
- Card: graphite background, 8px radius, 16px padding, 0.5px hairline border.
- Data table row: graphite background, faint row dividers, chalk cell text, small muted column headers.
- Icon tile: translucent white fill, faint border, monochrome icon.
- Feature card: graphite, blue icons, white active-tab indicator.

## Layout

- Hero: two columns, headline about 60% left, supporting copy and CTA about 40% right, product mockup full width below.
- Feature sections: tab list about 30%, mockup about 70%.
- Navigation: sticky 56px top bar, blurred translucent background on scroll.
- No photography, no gradients. Visuals are dark product UI, data tables and icon tiles.

## Do

- Keep headlines light (weight 400).
- Use 0.5px borders.
- Keep CTAs neutral (bone).
- Use signal-blue only for active states, links and icons.

## Don't

- Weight 600+ headlines.
- 1px borders.
- Chromatic CTA buttons.
- Gradients or heavy drop shadows.
- Decorative green or red.

## Light theme

The dark palette above is the reference. The light theme keeps every token role and changes only the values, so components never branch on theme. It is derived, not part of the Refero source.

Theme is set by `data-theme="dark|light"` on `<html>`, together with `color-scheme`. The default follows `prefers-color-scheme` (dark when unsupported). The top bar toggle (sun and moon icon button, placed before the user menu, also on the signed-out landing) stores an explicit choice in localStorage under `bsh-theme`. The system scheme is followed live only while no choice is stored. A tiny inline script in `index.html` applies the theme before first paint.

### Light neutrals

| Token | Hex | Role |
|---|---|---|
| void | #f5f6f8 | Page canvas, footer, viewer pane |
| graphite | #ffffff | Cards, panels, table rows |
| charcoal | #eceef2 | Inputs, bar tracks, secondary surfaces |
| smoke | #c9cdd5 | Scrollbar thumbs, resizer, subtle separators |
| steel | #6b7280 | Captions, mock viewer slab strokes |
| fog | #515867 | Secondary text, icon strokes |
| ash | #5f6675 | Tertiary text, placeholders, disabled |
| chalk | #272a31 | Body text, table cell text |
| snow | #0a0b0d | Headings and primary text |
| bone | #15171b | Primary CTA fill (inverted: ink fill) |
| ink | #ffffff | CTA label text |

### Light accents

| Token | Hex | Role |
|---|---|---|
| signal-blue | #2563eb | Active states, links, icon fills, selection |
| arc-blue | #1d4ed8 | Text accents, Viewable badge, icon tiles |
| ring-blue | #3b82f6 | Focus rings (3.4:1 on canvas, 3.7:1 on cards) |
| mint | #15803d | Success badge text and outline |
| fern | #16a34a | Soft green washes |
| coral | #c62828 | Destructive and error text |
| ember | #ea580c | Decorative icon chip only (unchanged) |
| iris | #314ef0 | Brand chip tint (unchanged) |

### Light translucent layers

| Token | Value | Role |
|---|---|---|
| hairline | rgb(0 0 0 / 0.10) | 0.5px borders |
| hairline-faint | rgb(0 0 0 / 0.06) | Row dividers, chart grid |
| ghost-fill | rgb(0 0 0 / 0.04) | Secondary button, icon tile |
| ghost-fill-hover | rgb(0 0 0 / 0.08) | Hover and selected row |
| ghost-fill-active | rgb(0 0 0 / 0.12) | Pressed |
| inset-highlight | transparent | No inset highlight on white cards |
| accent-pressed | #1e40af | Pressed Viewable badge text (dark: ring-blue) |
| scrim | rgb(15 17 22 / 0.4) | Overlay backdrop (dark: black at 0.6) |
| match | rgb(37 99 235 / 0.18) | Search match highlight |
| swatch-ring | rgb(0 0 0 / 0.25) | Inner ring on paint swatches |

Paint swatches keep their fixed data colors in both themes. The mock viewer fills and the landing floor plan fills have per-theme tokens (`mock-*`, `plan-fill`).

### Light rules

- Same character: 0.5px hairline borders, weight 400 headings, no gradients, blue only for active, links, icons and availability, mint and coral only for status.
- Primary CTA is inverted: ink fill (bone token), white label (ink token), 8px radius, hover goes to snow.
- Elevation: no inset highlight. The only cast shadow stays on the landing product mockups, `0 24px 48px rgb(15 23 42 / 0.10)` in light against `rgb(0 0 0 / 0.4)` in dark. The primary button shadow is `0 1px 2px rgb(15 23 42 / 0.16)`.
- Selection text is white on signal-blue in both themes (`on-accent`).
- Every text pair verified in dark passes WCAG AA in light: body 13.3 to 14.4, secondary fog 6.0 to 7.1, selected row fog 6.0, ash 4.8 to 5.8, Viewable badge 5.6 to 6.7, mint 4.6 to 5.0, coral 5.2 to 5.6, CTA label 17.9, selection 5.2. Focus ring and icon fills pass 3:1.

## Adaptations for this app

The source describes a marketing site. For the BIM Showcase Hub application:

- The project tree is the Documents pane, docked left by default and styled as a graphite card, in place of "no sidebar".
- The landing view uses the two-column hero, with the app shell below it after sign-in.
- The Autodesk Viewer follows the page theme through `setTheme` (`dark-theme` or `light-theme`), and the scene background is set from the graphite and void tokens on start, model load and every theme change. CSS overrides match these tokens.
- The app has dark and light themes (see Light theme). The dark sections above remain the reference palette.
- Paint swatches are user data colors, not status. They use the same three chips (red, green, blue) in the toolbar and the landing mockup, and are the only sanctioned use of red, green and blue outside status and active states.
- Feedback uses one shared state block with loading (skeleton rows), empty (specific copy and a next step) and error (icon, plain-language message, Retry) variants. Raw server strings appear only in a title attribute.
- The app is a dock of panes (Documents, Viewer, Model summary, Dashboard). Panes are graphite cards with hairline borders, 32px tab headers and the 12px gutter between them, and can be moved, resized, tabbed, collapsed to their header and floated inside the page. Floating panes keep the hairline border and get no cast shadow. Below 876px the panes stack and the document panel becomes an overlay.
- The document panel is 320px by default.
- The "Viewable" status badge on tree rows is outlined in arc-blue, a deliberate departure from the mint status badge. Blue marks active and availability state for tree rows (selection, openable versions). Mint is reserved for success statuses such as export completion.
