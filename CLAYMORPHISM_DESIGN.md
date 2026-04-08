# Claymorphism Design System 🎨

## Overview

Your application has been transformed with **claymorphism** — a modern UI/UX design trend combining:
- Soft, rounded clay-like shapes
- Warm, muted pastel color palette
- Smooth, diffused shadows for depth
- Tactile, organic feel
- Smooth animations and transitions

## Color Palette

### Primary Colors
- **Soft Beige** (`#f5f1ed`) - Main background
- **Warm White** (`#faf8f5`) - Secondary background  
- **Warm Taupe** (`#f0ebe5`) - Tertiary background

### Accent Colors
- **Clay/Terracotta** (`#d4a574`) - Warm accent for primary actions
- **Soft Coral** (`#e8b4a8`) - Warning/secondary accent
- **Sage Green** (`#a8d5ba`) - Success state
- **Soft Lavender** (`#c8b8e4`) - Info/neutral accent
- **Soft Sky** (`#b8d8e8`) - Secondary info state

### Text Colors
- **Dark Brown** (`#4a4340`) - Primary text
- **Medium Brown** (`#8b7d78`) - Secondary text
- **Light Brown** (`#b5a89f`) - Tertiary text

## Design Elements

### Buttons
- 24px border radius for soft, rounded appearance
- Smooth `cubic-bezier(0.34, 1.56, 0.64, 1)` transitions
- Subtle lift animation on hover (`translateY(-2px)`)
- Layered shadows (outer + inset white border)
- Gradient backgrounds with warm colors

**Classes:**
```html
<!-- Primary Button -->
<button class="btn btn-primary">Action</button>

<!-- Secondary Button -->
<button class="btn btn-secondary">Alternative</button>
```

### Cards & Containers
- 20px border radius for roundness
- Soft border: `var(--clay-border)` with 1.5px width
- Dual shadow system:
  - Outer: soft drop shadow
  - Inset: subtle white highlight at top
- Background: `var(--clay-bg-secondary)`

**Classes:**
```html
<div class="card">
  Your content here
</div>
```

### Input Fields
- Smooth focus transitions with clay accent color
- Gradient background (light → primary)
- Border color change on focus
- 3px accent glow on focus state

**Classes:**
```html
<input type="text" placeholder="Enter text..." class="outline-none" />
<textarea placeholder="Your message..."></textarea>
<select>
  <option>Choose...</option>
</select>
```

### Badges & Status
- 16px border radius
- Gradient backgrounds per status
- Soft shadows
- Success (Sage): Waiting/Available
- Warning (Coral): Pending/Busy  
- Danger (Coral): Offline/Error
- Info (Sky): Active/Serving

**Classes:**
```html
<span class="badge badge-success">Available</span>
<span class="badge badge-warning">Pending</span>
<span class="badge badge-danger">Offline</span>
<span class="badge badge-info">Active</span>
```

## Typography

- **Font**: System fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", ...`)
- **Letter Spacing**: 0.3-0.5px for elegance
- **Font Weights**: 400 (regular), 500 (medium), 600 (bold)
- **Text Color**: All text uses clay text colors for cohesion

## Shadows

The design uses a three-tier shadow system for depth:

```css
--clay-shadow-soft: rgba(74, 67, 64, 0.06);    /* Subtle, very light */
--clay-shadow-medium: rgba(74, 67, 64, 0.12);  /* Moderate depth */
--clay-shadow-deep: rgba(74, 67, 64, 0.18);    /* Strong depth */
```

**Shadow Applications:**
- **Buttons**: Soft on default, medium on hover
- **Cards**: Soft outer + inset highlight
- **Modals**: Deep shadow for prominence
- **Scrollbar**: Soft gradient shadow

## Animations

### Built-in Effects
- **slideUp**: 0.4s smooth entrance from bottom
- **fadeIn**: Simple fade effect
- **bounce**: Playful up-down motion
- **pulse**: Breathing effect for attention

### Transition Timing
- **Standard**: 0.3s ease
- **Button**: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) - bouncy
- **Hover**: Immediate with smooth path

## Components Updated

### ✅ Login Page
- Full claymorphism styling
- Faculty sidebar with soft badges
- Input fields with clay focus states
- Warm accent colors throughout
- Smooth animations on load

### ✅ Kiosk View
- Header with new color scheme
- Clay card backgrounds
- Sage green success badges
- Soft shadows on all elements

### ✅ Global Styles
- CSS variable foundation in `index.css`
- Tailwind config extension
- Responsive adjustments at 768px breakpoint
- Scrollbar styling with clay colors

## CSS Variable Reference

```css
:root {
  --clay-bg-primary: #f5f1ed;
  --clay-bg-secondary: #faf8f5;
  --clay-bg-tertiary: #f0ebe5;
  
  --clay-accent-warm: #d4a574;
  --clay-accent-soft-coral: #e8b4a8;
  --clay-accent-sage: #a8d5ba;
  --clay-accent-lavender: #c8b8e4;
  --clay-accent-sky: #b8d8e8;
  
  --clay-text-primary: #4a4340;
  --clay-text-secondary: #8b7d78;
  --clay-text-light: #b5a89f;
  
  --clay-shadow-soft: rgba(74, 67, 64, 0.06);
  --clay-shadow-medium: rgba(74, 67, 64, 0.12);
  --clay-shadow-deep: rgba(74, 67, 64, 0.18);
  
  --clay-border: rgba(212, 165, 116, 0.15);
  --clay-border-accent: rgba(212, 165, 116, 0.25);
}
```

## Quick Start

### Using CSS Variables
```jsx
<div style={{ color: 'var(--clay-text-primary)', background: 'var(--clay-bg-secondary)' }}>
  Content
</div>
```

### Using Tailwind Classes
```jsx
<button className="btn btn-primary">Submit</button>
<div className="card">Card Content</div>
<span className="badge badge-success">Success</span>
```

### Creating New Components
1. Use `border-radius: 20px` for rounded clay feel
2. Apply `var(--clay-shadow-soft)` for subtle depth
3. Use accent colors for CTAs and hover states
4. Maintain warm color palette throughout
5. Add smooth `transition: all 0.3s ease` for interactions

## Browser Support

- Chrome/Edge 88+
- Firefox 87+
- Safari 14.1+
- Mobile browsers (iOS Safari 14.5+, Chrome Android)

## Performance Notes

- CSS gradients are GPU-accelerated
- Shadow effects are optimized with contained layers
- Animations use `transform` and `opacity` for 60fps performance
- Variables reduce CSS file size vs hardcoded colors

## Future Enhancements

Potential additions to the claymorphism system:
- Animated gradient backgrounds
- Neumorphic depth variations
- Clay texture overlays (subtle)
- Micro-interactions on interactions
- Voice-responsive accessibility improvements
- Dark mode variant (warm neutrals)

## Maintenance

To maintain claymorphism consistency:
1. Always use CSS variables in new components
2. Keep border radius at 16px-24px range
3. Use soft shadows (not harsh blacks)
4. Limit color palette to defined accents
5. Test transitions on lower-end mobile devices
6. Ensure adequate contrast for accessibility (WCAG AA)

---

**Design System Version:** 1.0  
**Last Updated:** March 2026  
**Framework:** React 18+ with Tailwind CSS
