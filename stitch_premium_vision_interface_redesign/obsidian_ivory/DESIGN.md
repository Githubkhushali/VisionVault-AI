---
name: Obsidian & Ivory
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c8c7bc'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#929187'
  outline-variant: '#47473f'
  surface-tint: '#c8c8b0'
  primary: '#ffffff'
  on-primary: '#303221'
  primary-container: '#e4e4cc'
  on-primary-container: '#646652'
  inverse-primary: '#5e604d'
  secondary: '#c5c5d8'
  on-secondary: '#2e2f3e'
  secondary-container: '#464858'
  on-secondary-container: '#b6b7ca'
  tertiary: '#ffffff'
  on-tertiary: '#24342b'
  tertiary-container: '#d5e7da'
  on-tertiary-container: '#58685e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e4e4cc'
  primary-fixed-dim: '#c8c8b0'
  on-primary-fixed: '#1b1d0e'
  on-primary-fixed-variant: '#474836'
  secondary-fixed: '#e1e1f5'
  secondary-fixed-dim: '#c5c5d8'
  on-secondary-fixed: '#191b29'
  on-secondary-fixed-variant: '#444655'
  tertiary-fixed: '#d5e7da'
  tertiary-fixed-dim: '#b9cbbe'
  on-tertiary-fixed: '#0f1f16'
  on-tertiary-fixed-variant: '#3a4a41'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
  gutter: 24px
  margin: 32px
---

## Brand & Style

This design system targets a high-end professional demographic, emphasizing precision, calm, and performance. The brand personality is "Quiet Authority"—it does not shout for attention but earns it through meticulous craft and functional clarity.

The visual style is a fusion of **Modern Corporate** and **Subtle Glassmorphism**. It utilizes the deep blacks of high-performance developer tools (Linear/Vercel) balanced with the organic warmth and spatial depth found in Apple’s design language. The interface should feel like a physical object made of dark obsidian and frosted glass, punctuated by soft, natural accents.

- **Primary Motif:** Translucency and depth.
- **Tone:** Technical yet sophisticated.
- **Emotional Response:** Focus, reliability, and premium quality.

## Colors

The palette is rooted in deep, "ink-trap" blacks to maximize contrast and reduce eye strain during long work sessions.

- **Foundational Neutrals:** Use `#0B0B0B` for the primary background and `#121212` for raised surfaces (cards, sidebars). 
- **Warm Beige Accent:** `#F5F5DC` is the "Ivory" of the system, used sparingly for primary actions and high-level brand moments to provide a sophisticated contrast against the dark base.
- **Muted Pastel Highlights:** Lavender (`#E6E6FA`) and Sage (`#BCCEC1`) serve as functional highlights for status indicators, category tags, or subtle hover states.
- **Borders:** Use low-opacity whites (`rgba(255, 255, 255, 0.08)`) to define edges without creating visual noise.

## Typography

The typography relies exclusively on **Inter** to maintain a systematic, utilitarian aesthetic. 

- **Weight Strategy:** Use Semibold (`600`) for headers to create a strong visual anchor. Medium (`500`) is reserved for labels and interactive elements.
- **Scale:** High contrast between display sizes and body text is essential. 
- **Micro-copy:** Use the `label-sm` style with increased letter spacing and uppercase styling for small metadata or section headers to ensure legibility on dark backgrounds.
- **Mobile:** For screens smaller than 768px, scale `display` down to `32px` and `headline-lg` down to `24px`.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** with generous, "Apple-esque" margins to create a sense of luxury and breathing room.

- **Grid:** 12-column system for desktop, 4-column for mobile.
- **Spacing Rhythm:** Based on a 4px baseline. Use `lg` (24px) for most internal card padding and `xl` (40px) for section vertical spacing.
- **Safe Areas:** Maintain a minimum 32px outer margin on desktop to prevent content from feeling cramped against the browser edges.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Glassmorphism**, rather than traditional heavy shadows.

- **Level 0 (Base):** `#0B0B0B` (Background).
- **Level 1 (Floating/Cards):** `#121212` with a `1px` solid border (`rgba(255, 255, 255, 0.08)`).
- **Glass Effect:** Apply `backdrop-filter: blur(12px)` and `background: rgba(18, 18, 18, 0.7)` to overlays, sidebars, and navigation bars.
- **Shadows:** Use a single, very soft ambient shadow for elevated elements: `0 8px 32px rgba(0, 0, 0, 0.4)`.
- **Inner Glow:** High-end components (like buttons or active states) should feature a subtle `0.5px` inner stroke at the top edge to simulate light hitting a physical bevel.

## Shapes

The design uses a "Rounded" language to soften the technical nature of the dark palette.

- **Standard Elements:** Buttons, inputs, and small cards use `0.5rem` (8px).
- **Large Containers:** Main content areas and large glassmorphic cards use `1rem` (16px).
- **Pills:** Status badges and "New" indicators use a full circle radius for a distinct organic look.

## Components

### Buttons
- **Primary:** Background `#F5F5DC`, text `#0B0B0B`. No border.
- **Secondary:** Background `rgba(255, 255, 255, 0.05)`, border `rgba(255, 255, 255, 0.1)`, text white.
- **Interaction:** On hover, primary buttons increase opacity; secondary buttons increase border brightness.

### Sidebar
- **Visuals:** Glassmorphic background (blur + transparency). 
- **Active State:** A subtle vertical pill of `#F5F5DC` on the far left of the menu item, with a low-opacity background tint (`rgba(245, 245, 220, 0.1)`).

### Glassmorphic Cards
- **Construction:** Background `#121212` at 80% opacity, 12px blur, 1px border `rgba(255, 255, 255, 0.08)`.
- **Header:** Use `label-sm` for titles to maintain a professional, data-dense look.

### Data Tables
- **Styling:** Minimalist. No vertical lines. Horizontal lines use `rgba(255, 255, 255, 0.04)`.
- **Header:** Sticky, glassmorphic header with 10px blur for better scroll context.

### Status Badges
- **Animated:** Use a "pulsing dot" next to the text. For example, a Sage (`#BCCEC1`) dot with a slow scale animation for "Active" states.
- **Backgrounds:** Very low-opacity versions of the pastel colors (10-15% alpha).

### Inputs
- **Style:** Dark background (`#0B0B0B`), 1px border. Focus state moves the border to `Primary Ivory` with a subtle outer glow.