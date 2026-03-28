# Design System Specification: Obsidian Luxe

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Atmospheric Architect."** 

In an era of flat, utilitarian fintech interfaces, this system rejects the "template" look. We are building a digital vault that feels both impenetrable and ethereal. By moving away from rigid grids and 1px borders, we embrace a high-end editorial feel characterized by **intentional asymmetry, overlapping translucent layers, and high-contrast typographic scales.**

This system leverages the depth of a dark-mode-first environment to create a sense of infinite space. We do not just display data; we curate a financial narrative through atmospheric backgrounds and luminous accents that guide the user’s eye like neon signs in a sophisticated midnight cityscape.

---

## 2. Color Strategy & Atmospheric Depth
Our palette is rooted in deep obsidian tones, punctuated by vibrant, "living" accents.

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background provides all the separation required. If you feel the need for a line, you haven't used your surface tiers effectively.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted glass sheets. Depth is achieved by "stacking" the surface-container tiers:
- **Base (Background):** `#0A0A0F` — The infinite void.
- **Surface L1 (Surface):** `#12121A` — The primary canvas for content.
- **Surface L2 (Container Low):** `#1A1A2E` — Nested cards or secondary navigation.
- **Surface L3 (Container High):** `#242438` — Modals, popovers, or active state focus.

### The "Glass & Gradient" Rule
To achieve a premium "Obsidian" feel, use **Glassmorphism** for floating elements (cards, headers, nav bars). 
- **Recipe:** Apply a semi-transparent `surface-container` color (e.g., `#1A1A2E` at 60% opacity) with a `backdrop-blur` of 20px–40px.
- **Signature Textures:** Use subtle linear gradients for CTAs, transitioning from `primary` (`#6C5CE7`) to `primary-container` (`#5847D2`) at a 135-degree angle. This adds a "soul" to the UI that flat colors cannot mimic.

---

## 3. Typography: The Editorial Voice
Our typography creates a hierarchy of authority and precision.

| Role | Font Family | Usage |
| :--- | :--- | :--- |
| **Hero / Big Numbers** | **Clash Display (Bold)** | Large balances, total net worth, and high-impact marketing headers. |
| **Headings** | **Space Grotesk (Semibold)** | Page titles and section headers. High-tech, modernist feel. |
| **Financial Data** | **JetBrains Mono (Medium)** | Transaction lists, account numbers, and any tabular data. Conveys technical accuracy. |
| **Body / UI** | **DM Sans (Regular/Medium)** | Microcopy, labels, and long-form descriptions. Ensures readability. |

**Scale Strategy:** Use aggressive contrast. A `display-lg` (3.5rem) balance should sit confidently next to a `label-sm` (0.68rem) timestamp to create an editorial, bespoke aesthetic.

---

## 4. Elevation & Depth
We convey importance through **Tonal Layering** rather than structural scaffolding.

- **The Layering Principle:** Instead of adding a border to a card, place a `surface-container-lowest` card inside a `surface-container-low` section. The contrast in value creates a soft, natural lift.
- **Ambient Shadows:** For floating components (modals/tooltips), use extra-diffused shadows. 
    - *Shadow Token:* `0 20px 50px -12px rgba(0, 0, 0, 0.5)`. 
    - The shadow should feel like a soft glow of darkness, not a hard drop-shadow.
- **The "Ghost Border" Fallback:** If accessibility requires a border, use the `outline-variant` token (`#474554`) at **15% opacity**. Never use 100% opaque borders.
- **Neon States:** Active elements (selected tabs, focused inputs) should utilize a `primary` glow: `box-shadow: 0 0 15px rgba(108, 92, 231, 0.3)`.

---

## 5. Components & Primitive Styles

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), 12px (md) radius. No border. White text.
- **Secondary:** Glassmorphism style. Semi-transparent `surface-variant` with a subtle `outline-variant` ghost border.
- **Tertiary:** Ghost style. No background, `primary` text color, `space-grotesk` semibold.

### Input Fields
- **Container:** `surface-container-lowest` with a 12px (md) radius.
- **Interaction:** On focus, the background remains dark, but a 1px `primary` (Violet) ghost border appears with a soft outer glow.
- **Labels:** Always use `label-md` in `on-surface-variant` (muted) to keep the focus on the user's data.

### Cards & Lists (The "No Divider" Rule)
- Forbid 1px dividers between list items. Use **Vertical White Space** (Step 4 or 5 on the spacing scale) or subtle alternating background shifts (`surface-container-low` vs `surface-container-lowest`) to separate entries.
- **Corner Radius:** Use 16px (large) for main dashboard cards and 20px (XL) for high-level "Hero" containers.

### Gamification Chips
- Inspired by the luminous nature of high-end fintech, use the `tertiary` (Gold/Gold #FFD700) for "Level Up" or "Reward" states. These should have a subtle inner glow to look like a physical coin or jewel.

---

## 6. Do’s and Don'ts

### Do:
- **Do** use `JetBrains Mono` for every single currency value. It reinforces the "Fintech" precision.
- **Do** use asymmetric layouts. Align a large balance to the left and a "Quick Action" glass card slightly offset to the right to break the "Bootstrap" feel.
- **Do** use `Phosphor Icons` in Duotone. Set the secondary icon element to 30% opacity of the primary accent color.

### Don't:
- **Don't** use pure black (#000000). Always use our `background` (#0A0A0F) to maintain the "Obsidian" depth.
- **Don't** use standard 1px dividers. If you can't separate content with space or tone, re-evaluate the information architecture.
- **Don't** use high-saturation reds for everything. Reserve `error` (#FF5252) for critical failures; use `warning` (#FFB800) for soft alerts to maintain the "Luxe" composure.

---

## 7. Spacing & Rhythm
This system breathes. 
- Use **24px (6)** or **32px (8)** for standard page margins. 
- Use **16px (4)** for internal card padding.
- Avoid "tight" layouts; luxury is defined by the space you are willing to waste. If a component feels crowded, double the padding.