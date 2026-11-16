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
- Scale: 8, 13, 14, 16, 18, 32, 42, 52, 64px.
- Tracking: about -0.02 to -0.03em at body sizes, slightly looser at display sizes.

## Spacing and shape

- Base unit 4px, compact density.
- Max content width 1080px. 96px between sections. 28px card padding. 8px element gap.
- Radii: buttons and pills 10px, cards 12px, icon tiles 9px, badges 5px, large containers up to 24px.

## Elevation

Depth comes from 0.5px translucent white hairline borders and 1px inset white highlights. No cast shadows except on floating product mockups. Blue and green glows may be used as subtle focus or status rings.

## Components

- Primary button: bone fill, ink text, 10px radius, 14px text, light shadow. The only primary action style.
- Secondary button: translucent white ghost fill, white text.
- Text link: slightly transparent white, no padding or background.
- Status badge: transparent background, thin mint border, mint text, small dot prefix.
- Card: graphite background, 12px radius, 28px padding, 0.5px hairline border.
- Data table row: graphite background, faint row dividers, chalk cell text, small muted column headers.
- Icon tile: translucent white fill, faint border, monochrome icon.
- Feature card: graphite, blue icons, white active-tab indicator.

## Layout

- Hero: two columns, headline about 60% left, supporting copy and CTA about 40% right, product mockup full width below.
- Feature sections: tab list about 30%, mockup about 70%.
- Navigation: sticky 72px top bar, blurred translucent background on scroll.
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

## Adaptations for this app

The source describes a marketing site. For the BIM Showcase Hub application:

- The project tree is a collapsible left panel styled as a graphite card, in place of "no sidebar".
- The landing view uses the two-column hero, with the app shell below it after sign-in.
- The Autodesk Viewer uses its dark theme plus CSS overrides to match these tokens.
- Paint swatches are user data colors, not status. They use the same three chips (red, green, blue) in the toolbar and the landing mockup, and are the only sanctioned use of red, green and blue outside status and active states.
- Feedback uses one shared state block with loading (skeleton rows), empty (specific copy and a next step) and error (icon, plain-language message, Retry) variants. Raw server strings appear only in a title attribute.
- The document panel is 320px by default and resizable between 260 and 480px.
