# Design System

The site uses a bespoke brand design system built on Tailwind CSS 4.x. All tokens are defined in `src/styles/global.css`.

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-ink` | `#001524` | Dark mode background, light mode text |
| `brand-smoke` | `#F3F3F3` | Light mode background, dark mode text |
| `brand-chestnut` | `#772E25` | Links, hover states, focus outlines |
| `brand-orange` | `#F58F29` | Decorative accent, CTAs, headers (fails contrast for body text) |
| `brand-orange-dark` | `#a95b00` | Accessible orange text (4.5:1 on smoke) |
| `brand-grey` | `#767B91` | Borders, decorative elements (fails contrast for text) |
| `brand-grey-dark` | `#5A5E6D` | Muted text on light backgrounds (5.5:1 contrast) |
| `brand-grey-light` | `#9499AB` | Muted text on dark backgrounds (5.8:1 contrast) |

### Dark Mode

System-preference based (`prefers-color-scheme: dark`). Swaps ink/smoke roles — ink becomes the background, smoke becomes the text color.

## Typography

| Role | Font | Weights |
|------|------|---------|
| Body | Source Sans 3 (Variable) | 400, 600 + italic |
| Headers | Fraunces (Variable) | 600, 700 (optical sizing 9–144) |

- Base font size: `18px` on the `html` element
- Fonts are self-hosted via `@fontsource-variable` packages (no Google Fonts CDN)
- Navigation text uses `lowercase` styling

## CSS Component Classes

Custom Tailwind component classes are defined in `src/styles/global.css` within `@layer components`. These provide consistent styling across the site:

### Text & Typography
- `.text-body` — Standard body text color (ink/smoke depending on mode)
- `.text-muted` — Subdued text (grey-dark on light, grey-light on dark)
- `.text-heading` — Heading color with Fraunces font

### Links & Interactions
- `.link-accent` — Chestnut-colored links with hover underline
- `.icon-interactive` — Clickable icon styling
- `.nav-link` — Navigation link with hover state
- `.nav-link-dropdown` — Dropdown menu link variant

### Buttons
- `.btn-primary` — Orange background, ink text
- `.btn-secondary` — Chestnut outline button
- `.btn-ghost` — Transparent button with hover background

### Layout & Containers
- `.article-container` — Frosted glass card effect for content
- `.section-bg` — Alternating section background
- `.section-bg-white` — White/dark section variant
- `.page-section-header` — Section heading with orange accent
- `.card` — Standard card container
- `.section-card` — Card used in landing page sections

### UI Components
- `.dropdown-menu` — Popup menu styling
- `.info-box` — Informational callout box
- `.badge-accent` / `.badge-accent-dark` — Tag/category badges
- `.input-default` — Form input styling
- `.list-item-hover` — List item with hover highlight

### Embedded Content (BEM)
- `.embedded-working-note` — Container for inline note embeds
- `.embedded-working-note__header` / `__title` / `__content` / `__footer` / `__link` — BEM children

## Accessibility

The color palette was designed with specific WCAG contrast ratios:

- `brand-grey-dark` (#5A5E6D) provides **5.5:1** contrast on smoke — safe for body text
- `brand-grey-light` (#9499AB) provides **5.8:1** contrast on ink — safe for body text in dark mode
- `brand-orange` (#F58F29) **fails** contrast requirements — used for decorative/accent purposes only
- `brand-orange-dark` (#a95b00) provides **4.5:1** contrast on smoke — safe for large text and UI elements
- Focus outlines use `brand-chestnut` for clear visibility in both modes
