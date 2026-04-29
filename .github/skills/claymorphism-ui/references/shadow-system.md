# Shadow System & Depth Guide

**Reference**: Based on Michał Malewicz's claymorphism methodology from [Hype4 Academy](https://hype4.academy/articles/design/claymorphism-in-user-interfaces)

## Clay Shadow Philosophy

Claymorphism uses a **distinct three-layer shadow approach** (not typical Material Design):

1. **Outer shadow** — Single, directional, can move on X-axis for playfulness
2. **Light inner shadow** (top-left) — Simulates light from above
3. **Dark inner shadow** (bottom-right) — Simulates shadow in depth

This creates the signature **soft 3D dome effect** that works across light AND dark backgrounds.

Your shadow system uses **warm-toned, diffused shadows** rather than harsh black:
```css
/* Warm brown shadow base (from clay text color) */
box-shadow: 0 4px 12px rgba(74, 67, 64, opacity);

Why warm brown? → Matches the warm clay palette aesthetic, not generic black
Why diffused? → Creates soft, organic depth rather than sharp shadows
```

---

## Shadow Scale Reference

| Level | Outer | Inner Light | Inner Dark | Use Case |
|-------|-------|-------------|------------|----------|
| **sm** | 0 2px 8px rgba(74,67,64,0.06) | inset 2px 2px 4px rgba(255,255,255,0.2) | inset -2px -2px 4px rgba(0,0,0,0.06) | Subtle elements |
| **md** | 0 4px 15px rgba(74,67,64,0.12) | inset 3px 3px 8px rgba(255,255,255,0.3) | inset -3px -3px 8px rgba(0,0,0,0.1) | Standard UI |
| **lg** | 0 8px 25px rgba(74,67,64,0.18) | inset 4px 4px 12px rgba(255,255,255,0.35) | inset -4px -4px 12px rgba(0,0,0,0.12) | Elevated surfaces |
| **xl** | 0 20px 60px rgba(74,67,64,0.25) | inset 6px 6px 16px rgba(255,255,255,0.4) | inset -6px -6px 16px rgba(0,0,0,0.15) | Maximum depth |

### CSS Variable Implementation (Legacy - Outer Shadow Only)

```css
:root {
  --clay-shadow-soft: rgba(74, 67, 64, 0.06);    /* sm */
  --clay-shadow-medium: rgba(74, 67, 64, 0.12);  /* md */
  --clay-shadow-deep: rgba(74, 67, 64, 0.18);    /* lg */
  /* xl not in CSS variables, construct as needed */
}

/* Tailwind config shadows */
shadows: {
  clay: {
    sm: '0 2px 8px rgba(74, 67, 64, 0.06)',
    md: '0 4px 15px rgba(74, 67, 64, 0.12)',
    lg: '0 8px 25px rgba(74, 67, 64, 0.18)',
    xl: '0 20px 60px rgba(74, 67, 64, 0.25)',
  }
}
```

**Note**: For true claymorphism 3D effect, use full dual-inner-shadow approach shown in shadow patterns below.

---

## Shadow Patterns

### 1. Simple Drop Shadow (Basic - Use When Limited Support)

```css
.card {
  box-shadow: 0 4px 15px var(--clay-shadow-soft);
}

.card:hover {
  box-shadow: 0 8px 25px var(--clay-shadow-medium);
}
```

**When to use**: Quick implementation, legacy browser support, subtle depth needed

---

### 2. Dual Inner Shadow (True Claymorphism - Recommended)

This is the signature Hype4 Academy technique for authentic 3D dome effect:

```css
.clay-element {
  background: var(--clay-bg-secondary);
  border-radius: 20px;
  
  /* Outer shadow + dual inner shadows */
  box-shadow: 
    0 4px 15px rgba(74, 67, 64, 0.12),      /* Outer: depth */
    inset 3px 3px 8px rgba(255, 255, 255, 0.3),   /* Inner light (top-left) */
    inset -3px -3px 8px rgba(0, 0, 0, 0.1);       /* Inner dark (bottom-right) */
}

.clay-element:hover {
  box-shadow: 
    0 8px 25px rgba(74, 67, 64, 0.18),
    inset 4px 4px 12px rgba(255, 255, 255, 0.35),
    inset -4px -4px 12px rgba(0, 0, 0, 0.12);
}
```

**Strength**: Creates true 3D dome illusion, works on light/dark backgrounds, user-friendly  
**When to use**: Premium UI, call-to-action cards, elevated surfaces

---

### 3. Layered Shadows (Enhanced Depth)

For maximum visual sophistication (use sparingly for performance):

```css
.clay-raised {
  box-shadow: 
    /* Outer shadow: depth below */
    0 8px 25px rgba(74, 67, 64, 0.12),
    /* Inset light: light from above */
    inset 0 1px 2px rgba(255, 255, 255, 0.4),
    /* Inset dark: shadow in depth */
    inset 0 -2px 4px rgba(0, 0, 0, 0.08);
}

.clay-raised:hover {
  box-shadow: 
    0 12px 35px rgba(74, 67, 64, 0.18),
    inset 0 2px 4px rgba(255, 255, 255, 0.5),
    inset 0 -3px 6px rgba(0, 0, 0, 0.1);
}
```

**When to use**: Premium cards, elevated buttons, call-to-action elements

---

### 4. Pressed/Inset Shadow

For active/focused states with depression effect:

```css
.button:active {
  box-shadow: 
    /* Minimal outer shadow */
    0 2px 8px var(--clay-shadow-soft),
    /* Inset shadow: pressed into surface */
    inset 0 2px 4px var(--clay-shadow-soft),
    inset 0 -1px 2px rgba(255, 255, 255, 0.2);
  transform: translateY(1px); /* Slight press down */
}
```

**When to use**: Button active states, pressed inputs, click feedback

---

### 5. Focus Ring Shadow

For accessibility focus indicators:

```css
button:focus-visible {
  outline: none;
  box-shadow: 
    /* Maintain original shadow */
    0 4px 15px var(--clay-shadow-soft),
    /* Focus ring: colored glow */
    0 0 0 3px rgba(212, 165, 116, 0.3);
}
```

**When to use**: All interactive elements (buttons, links, inputs, selects)

---

### 6. Disabled/Muted Shadow

For inactive or disabled states:

```css
button:disabled {
  box-shadow: 0 2px 6px rgba(74, 67, 64, 0.04); /* Very subtle */
  opacity: 0.5;
}
```

**When to use**: Disabled buttons, inactive cards, grayed-out elements

---

### 7. Shadow on Gradients

When applying shadows over gradient backgrounds:

```css
.gradient-card {
  background: linear-gradient(135deg, var(--clay-bg-primary), var(--clay-bg-tertiary));
  /* Shadow must be strong enough to show on lighter gradient area */
  box-shadow: 0 6px 18px var(--clay-shadow-medium);
}
```

**Test**: Verify shadow is visible on both light and dark gradient areas

---

## Multi-Element Shadow Compositions

### Stacked Cards with Progressive Shadow

```css
.card-stack {
  position: relative;
}

.card-stack > div:nth-child(1) {
  box-shadow: 0 2px 8px var(--clay-shadow-soft);
}

.card-stack > div:nth-child(2) {
  box-shadow: 0 4px 12px var(--clay-shadow-soft);
  transform: translateY(-2px);
}

.card-stack > div:nth-child(3) {
  box-shadow: 0 8px 20px var(--clay-shadow-medium);
  transform: translateY(-4px);
}
```

---

### Group Shadow (Container)

```css
.shadow-container {
  box-shadow: 
    0 10px 30px var(--clay-shadow-deep),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 20px;
}
```

---

## Animation Patterns

### Smooth Elevation on Hover

```css
.button {
  box-shadow: 0 4px 15px var(--clay-shadow-soft);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.button:hover {
  box-shadow: 0 8px 25px var(--clay-shadow-medium);
  transform: translateY(-2px);
}

.button:active {
  box-shadow: 0 2px 8px var(--clay-shadow-soft);
  transform: translateY(0);
}
```

**Easing explanation**:
- `cubic-bezier(0.34, 1.56, 0.64, 1)` creates elastic bounce
- Perfect for clay's soft, tactile feel
- Avoids robotic linear transitions

---

### Progressive Shadow Reveal

```css
.reveal-on-hover {
  box-shadow: 0 2px 6px var(--clay-shadow-soft);
  transition: box-shadow 0.2s ease;
}

.reveal-on-hover:hover {
  box-shadow: 0 8px 25px var(--clay-shadow-medium);
}
```

---

## Troubleshooting

### Problem: Shadow Too Subtle

**Diagnosis**: Elements blend into background, no depth perception

**Solutions**:
1. Increase opacity: `rgba(74, 67, 64, 0.10)` (was 0.06)
2. Increase blur: `0 4px 20px` (was 15px)
3. Increase offset: `0 6px 15px` (was 4px)

```css
/* Before: too subtle */
box-shadow: 0 4px 12px rgba(74, 67, 64, 0.06);

/* After: more visible */
box-shadow: 0 6px 18px rgba(74, 67, 64, 0.09);
```

---

### Problem: Shadow Too Harsh

**Diagnosis**: Shadows feel dark, not organic, doesn't match clay aesthetic

**Solutions**:
1. Reduce opacity: `rgba(74, 67, 64, 0.04)` (was 0.12)
2. Reduce blur: `0 4px 10px` (was 15px)
3. Reduce offset: `0 2px 12px` (was 4px)
4. **Never use black (#000000)**—use clay brown always

```css
/* Before: too dark/harsh */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

/* After: clay-appropriate */
box-shadow: 0 4px 12px rgba(74, 67, 64, 0.08);
```

---

### Problem: Shadow Inconsistent Across Backgrounds

**Diagnosis**: Shadow visible on light background but disappears on darker areas

**Solutions**:
1. Test shadow on all three background colors
2. Adjust opacity if needed (may need different value per background)
3. Add inset highlight for visibility on darker areas

```css
/* Test case: shadow on all backgrounds */
.test-bg-primary { background: var(--clay-bg-primary); }  /* Light */
.test-bg-tertiary { background: var(--clay-bg-tertiary); } /* Medium */

/* If shadow disappears on tertiary, use stronger shadow */
.element {
  box-shadow: 0 4px 15px rgba(74, 67, 64, 0.12); /* Stronger */
}
```

---

### Problem: Shadow Cuts Off in Container

**Diagnosis**: Element shadow cropped by `overflow: hidden`

**Solutions**:
1. Remove `overflow: hidden` if not needed
2. Use `overflow: visible` on shadow container
3. Or apply shadow to parent container instead

```css
/* ✗ Shadow cut off */
.container {
  overflow: hidden; /* Crops shadow */
}

/* ✓ Shadow visible */
.container {
  overflow: visible;
}

.shadow-element {
  box-shadow: 0 4px 15px var(--clay-shadow-soft);
}
```

---

## Performance Notes

### Avoid Over-Complexity

```css
/* ✗ Too many shadows = performance hit */
.over-engineered {
  box-shadow: 
    0 2px 8px rgba(74, 67, 64, 0.06),
    0 4px 12px rgba(74, 67, 64, 0.08),
    0 6px 16px rgba(74, 67, 64, 0.1),
    0 8px 20px rgba(74, 67, 64, 0.12),
    inset 0 1px 1px rgba(255, 255, 255, 0.5);
}

/* ✓ Effective with fewer layers */
.optimized {
  box-shadow: 
    0 4px 15px rgba(74, 67, 64, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
```

**Impact**: Each additional shadow layer costs GPU rendering time. Limit to 2-3 layers.

---

## Quick Checklists

### For New Components

- [ ] Component has appropriate shadow (sm/md/lg based on importance)
- [ ] Shadow uses `var(--clay-shadow-*)` variable, not hard-coded
- [ ] Hover state increases shadow depth progressively
- [ ] Active/pressed state reduces shadow (inset if appropriate)
- [ ] Focus state has visible focus ring shadow
- [ ] Shadow tested on all three background colors
- [ ] Shadow opacity adjusted if needed for visibility

### For Existing Components

- [ ] Replace hard-coded shadows with CSS variables
- [ ] Verify shadow scale progression (sm → md → lg)
- [ ] Add inset highlight for premium feel where appropriate
- [ ] Test shadow visibility on gradients
- [ ] Ensure shadow doesn't get cut off by overflow
- [ ] Smooth transitions between shadow states

---

## External Resources

- **Claymorphism CSS Generator**: [claymorphism.com](https://claymorphism.com/) — Michał Malewicz's tool to generate and test shadow values in real-time
- **Design Article**: [Hype4 Academy - Claymorphism in User Interfaces](https://hype4.academy/articles/design/claymorphism-in-user-interfaces) — Complete methodology, shadow techniques, and design philosophy
- **Design Tools**: Figma tutorials for creating inflated shapes and testing dual-shadow effects

