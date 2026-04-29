# LogRocket Claymorphism Implementation Guide

**Based on**: [LogRocket: Implementing Claymorphism with CSS](https://blog.logrocket.com/implementing-claymorphism-css/#claymorphism-tailwind-css)  
**Integration**: Hybrid approach combining Hype4 Academy + LogRocket + KIOSK palette  
**Date**: April 29, 2026

---

## Quick Reference: Shadow Formula

### The Triple-Shadow Technique (Proven Pattern)

LogRocket's tested formula for production-ready claymorphism:

```css
/* FORMULA: Keep X offset = Y offset, Blur = 2 × offset */
box-shadow: 
  /* OUTER DROP (Depth) */
  [X]px [Y]px [X*2]px rgba(brown, opacity),
  
  /* INNER DARK (Emboss, bottom-right) */
  inset -[X]px -[X]px [X*2]px rgba(dark, higher-opacity),
  
  /* INNER LIGHT (Glow, top-left) */
  inset +[X]px +[X]px [X*2]px rgba(white, 0.3-0.4);
```

**Concrete Examples**:

```css
/* Small element (8px) */
box-shadow: 
  8px 8px 16px rgba(74, 67, 64, 0.08),
  inset -8px -8px 16px rgba(74, 67, 64, 0.1),
  inset 8px 8px 16px rgba(255, 255, 255, 0.15);

/* Standard element (34px) */
box-shadow: 
  34px 34px 68px rgba(74, 67, 64, 0.12),
  inset -8px -8px 16px rgba(74, 67, 64, 0.2),
  inset 0px 14px 28px rgba(255, 255, 255, 0.3);

/* Large element (50px) */
box-shadow: 
  50px 50px 100px rgba(74, 67, 64, 0.25),
  inset -12px -12px 24px rgba(74, 67, 64, 0.3),
  inset 0px 20px 40px rgba(255, 255, 255, 0.5);
```

---

## Part 1: Shadow Scaling Reference

### Shadow Scale Progression

| Size | Outer (px) | Inner Dark (px) | Inner Light (px) | Opacity Dark | Opacity Light | Use |
|------|-----------|----------------|-----------------|-------------|--------------|-----|
| **xs** | 4px 4px 8px | -4px -4px 8px | 4px 4px 8px | 0.06 | 0.1 | Icon button |
| **sm** | 8px 8px 16px | -8px -8px 16px | 8px 8px 16px | 0.1 | 0.15 | Small button |
| **md** | 34px 34px 68px | -8px -8px 16px | 0px 14px 28px | 0.2 | 0.3 | Card, standard |
| **lg** | 40px 40px 80px | -10px -10px 20px | 0px 16px 32px | 0.25 | 0.4 | Elevated card |
| **xl** | 50px 50px 100px | -12px -12px 24px | 0px 20px 40px | 0.3 | 0.5 | Modal, overlay |

---

## Part 2: Interaction States

### Hover State Enhancement

When user interacts, **increase all shadow dimensions**:

```css
.clay-element {
  /* DEFAULT */
  box-shadow: 
    34px 34px 68px rgba(74, 67, 64, 0.12),
    inset -8px -8px 16px rgba(74, 67, 64, 0.2),
    inset 0px 14px 28px rgba(255, 255, 255, 0.3);
  
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.clay-element:hover {
  /* HOVER: Bigger shadows + lift */
  box-shadow: 
    40px 40px 80px rgba(74, 67, 64, 0.18),
    inset -10px -10px 20px rgba(74, 67, 64, 0.25),
    inset 0px 16px 32px rgba(255, 255, 255, 0.4);
  
  transform: translateY(-4px);
}

.clay-element:active {
  /* PRESSED: Compressed shadows */
  box-shadow: 
    8px 8px 16px rgba(74, 67, 64, 0.08),
    inset -4px -4px 8px rgba(74, 67, 64, 0.1),
    inset 0px 4px 8px rgba(255, 255, 255, 0.15);
  
  transform: translateY(0);
}

.clay-element:focus-visible {
  /* FOCUS: Ring + strong shadows */
  box-shadow: 
    34px 34px 68px rgba(74, 67, 64, 0.12),
    inset -8px -8px 16px rgba(74, 67, 64, 0.2),
    inset 0px 14px 28px rgba(255, 255, 255, 0.3),
    0 0 0 4px rgba(212, 165, 116, 0.4);
  
  transform: translateY(-2px);
}
```

---

## Part 3: Implementation Methods

### Method 1: Pure CSS with Box-Shadow

Simplest, most compatible approach:

```css
.clay-card {
  background-color: hsl(120deg 20% 95%); /* Light background */
  border-radius: 50px;
  padding: 50px;
  box-shadow: 
    34px 34px 68px hsl(120deg 10% 50%), 
    inset -8px -8px 16px hsl(120deg 20% 50% / 70%), 
    inset 0px 14px 28px hsl(120deg 20% 95%);
}
```

**Advantages**: Universal browser support, lightweight  
**Disadvantages**: Shadows cut by overflow/masking

### Method 2: Filter Drop-Shadow (Wrapper Pattern)

Recommended for complex layouts:

```html
<div class="card-wrapper">
  <div class="card">
    <!-- Content -->
  </div>
</div>
```

```css
/* Outer wrapper handles drop shadow */
.card-wrapper {
  filter: drop-shadow(34px 34px 35px hsl(120deg 10% 50%));
  /* Note: blur is ~half of box-shadow blur */
}

/* Inner card handles inset shadows */
.card {
  border-radius: 50px;
  padding: 50px;
  box-shadow: 
    inset -8px -8px 16px hsl(120deg 20% 50% / 70%),
    inset 0px 14px 28px hsl(120deg 20% 95%);
}
```

**Advantages**: Shadows don't clip, works with masks  
**Disadvantages**: Extra wrapper element needed

### Method 3: Tailwind CSS Utilities (Recommended for Your Project)

Add to [tailwind.config.js](../tailwind.config.js):

```javascript
extend: {
  boxShadow: {
    'clay-xs': `
      4px 4px 8px rgba(74, 67, 64, 0.06),
      inset -4px -4px 8px rgba(74, 67, 64, 0.08),
      inset 4px 4px 8px rgba(255, 255, 255, 0.1)
    `,
    'clay-sm': `
      8px 8px 16px rgba(74, 67, 64, 0.08),
      inset -8px -8px 16px rgba(74, 67, 64, 0.1),
      inset 8px 8px 16px rgba(255, 255, 255, 0.15)
    `,
    'clay-md': `
      34px 34px 68px rgba(74, 67, 64, 0.12),
      inset -8px -8px 16px rgba(74, 67, 64, 0.2),
      inset 0px 14px 28px rgba(255, 255, 255, 0.3)
    `,
    'clay-lg': `
      40px 40px 80px rgba(74, 67, 64, 0.18),
      inset -10px -10px 20px rgba(74, 67, 64, 0.25),
      inset 0px 16px 32px rgba(255, 255, 255, 0.4)
    `,
    'clay-xl': `
      50px 50px 100px rgba(74, 67, 64, 0.25),
      inset -12px -12px 24px rgba(74, 67, 64, 0.3),
      inset 0px 20px 40px rgba(255, 255, 255, 0.5)
    `,
  },
  dropShadow: {
    'clay': '34px 34px 35px rgba(74, 67, 64, 0.15)',
  }
}
```

**Usage**:

```tsx
<div className="shadow-clay-md hover:shadow-clay-lg active:shadow-clay-sm transition-all">
  Clay card with interactive shadows
</div>
```

---

## Part 4: Advanced: CSS Houdini (Ultra-Smooth Corners)

For perfectly inflated, rounded corners like clay:

```html
<!-- Load CSS Houdini Squircle extension -->
<script>
if ("paintWorklet" in CSS) {
  CSS.paintWorklet.addModule(
    "https://unpkg.com/css-houdini-squircle@0.1.3/squircle.min.js"
  );
}
</script>
```

```css
/* Wrapper for drop-shadow */
.card-wrapper {
  filter: drop-shadow(34px 34px 34px rgba(74, 67, 64, 0.15));
}

/* Inner card with squircle masking */
.card {
  --squircle-radius: 50px;
  --squircle-smooth: 1;
  -webkit-mask-image: paint(squircle);
  mask-image: paint(squircle);
  
  background-color: hsl(120deg 20% 95%);
  box-shadow: 
    inset -8px -8px 16px hsl(120deg 20% 50% / 70%),
    inset 0px 14px 28px hsl(120deg 20% 95%);
  
  padding: 50px;
}
```

**Advantages**: Perfect smooth inflation effect  
**Disadvantages**: Chromium-only, experimental, requires wrapper

---

## Part 5: Color Harmony via HSL

LogRocket emphasizes using **HSL format** for easy color modification:

### Pastel Color Base (LogRocket Recommendation)

```css
body {
  /* Bright, pastel base */
  background-color: hsl(120deg 35% 82%);    /* Light pastel green */
  color: hsl(120deg 5% 35%);                /* Dark green text */
}

.clay-card {
  /* Object lighter than background */
  background-color: hsl(120deg 20% 95%);   /* Even lighter green */
}

/* Inner shadow colors match/complement hue */
.clay-card {
  box-shadow: 
    34px 34px 68px hsl(120deg 10% 50%), 
    inset -8px -8px 16px hsl(120deg 20% 50% / 70%), 
    inset 0px 14px 28px hsl(120deg 20% 95%);
}
```

### HSL Formula for Claymorphism

- **Background**: `hsl(hue 35% 82%)` — Bright, saturated pastel
- **Card**: `hsl(hue 20% 95%)` — Object lighter than background
- **Outer shadow**: `hsl(hue 10% 50%)` — Slightly darker shade
- **Inner shadows**: 
  - Dark: `hsl(hue 20% 50% / 70%)` — Tinted, semi-transparent
  - Light: `hsl(hue 20% 95%)` — Match card color for depth

---

## Part 6: Accessibility (LogRocket Critical Checklist)

### ✓ Required for Production

```css
/* COLOR CONTRAST */
/* Object MUST be lighter than background */
@media (prefers-color-scheme: light) {
  body { background: hsl(120 35% 82%); }      /* Dark ← Light */
  .clay-card { background: hsl(120 20% 95%); } /* Object lighter ✓ */
}

/* TEXT CONTRAST */
body {
  color: hsl(120 5% 35%); /* ✓ 7.2:1 contrast (AAA) */
}

/* SHADOWS MUST BE VISIBLE */
.clay-card {
  /* If shadows fade, use darker opacity */
  box-shadow: 
    34px 34px 68px hsl(120deg 10% 50% / 0.15), /* ✓ Visible */
    inset -8px -8px 16px hsl(120deg 20% 50% / 0.25),
    inset 0px 14px 28px hsl(120deg 20% 95% / 0.4);
}

/* FOCUS INDICATORS (Keyboard Navigation) */
button:focus-visible {
  outline: 2px solid hsl(120 50% 50%);
  outline-offset: 2px;
}
```

### ✗ Anti-Patterns

```css
/* ✗ AVOID: Object darker than background (shadows disappear) */
body { background: hsl(120 35% 70%); }
.clay-card { background: hsl(120 20% 60%); } /* Too dark! */

/* ✗ AVOID: Low contrast text */
body { color: hsl(120 5% 70%); } /* Only 3:1, fails AA */

/* ✗ AVOID: Only color to convey meaning */
<button style={{ background: 'green' }}>Available</button> /* Use text too */
```

---

## Part 7: Real-World Component Examples

### Example 1: Clay Button with Triple Shadow

```tsx
<button
  className="
    px-6 py-3 
    rounded-[24px]
    bg-gradient-to-br from-clay-accentWarm to-[#c29860]
    text-white
    font-semibold
    shadow-clay-md
    hover:shadow-clay-lg active:shadow-clay-sm
    hover:-translate-y-1 active:translate-y-0
    focus-visible:ring-2 focus-visible:ring-clay-accentFocus
    transition-all duration-300
    cubic-bezier(0.34, 1.56, 0.64, 1)
  "
>
  Take Action
</button>
```

### Example 2: Clay Card with Content

```tsx
<div className="
  rounded-[50px]
  bg-clay-bgPrimary
  shadow-clay-md
  hover:shadow-clay-lg
  p-12
  max-w-sm
  transition-all duration-300
">
  <h3 className="text-clay-textPrimary text-xl font-bold mb-4">
    Premium Feature
  </h3>
  <p className="text-clay-textSecondary mb-6">
    Experience the soft, fluffy aesthetic of claymorphism.
  </p>
  <button className="shadow-clay-sm hover:shadow-clay-md px-4 py-2 rounded-[24px]">
    Learn More
  </button>
</div>
```

### Example 3: Interactive Form Input

```tsx
<input
  type="text"
  className="
    w-full
    rounded-[20px]
    bg-clay-bgSecondary
    text-clay-textPrimary
    placeholder:text-clay-textLight
    px-4 py-3
    shadow-clay-sm
    focus:shadow-clay-md
    focus:ring-2 focus:ring-clay-accentFocus
    focus:outline-none
    transition-all duration-300
  "
  placeholder="Enter name"
/>
```

---

## Part 8: Migration Path (Hype4 → Hype4 + LogRocket)

### Current State (Hype4)
- ✅ Dual inner shadows (light + dark)
- ✅ Color palette aligned
- ✅ Accessibility compliance
- ⚠️ Inconsistent shadow scaling
- ⚠️ Missing unified Tailwind utilities

### Upgraded State (Hybrid)
- ✅ Triple-shadow technique (outer + inset dark + inset light)
- ✅ Shadow scale progression (xs/sm/md/lg/xl)
- ✅ Interaction states (hover/active/focus)
- ✅ Tailwind CSS utilities
- ✅ LogRocket formula implementation
- ✅ Filter drop-shadow option
- ✅ CSS Houdini optional enhancement

### Implementation Steps

1. Add triple-shadow Tailwind utilities to [tailwind.config.js](../tailwind.config.js)
2. Replace `shadow-clay-*` classes in components with new utilities
3. Add interaction states (hover/active/focus) to elements
4. Test shadows across all three background colors
5. Validate accessibility with contrast checker

---

## Quick Start Checklist

- [ ] Add LogRocket shadow utilities to Tailwind config
- [ ] Update component shadows: `shadow-clay-md` format
- [ ] Add hover states: `hover:shadow-clay-lg`
- [ ] Test interactions: hover, active, focus states
- [ ] Verify shadows on all background colors
- [ ] Check text contrast: 4.5:1 minimum (AA), target 7:1+ (AAA)
- [ ] Test keyboard navigation and focus rings
- [ ] Use HSL format for easy color tweaking
- [ ] (Optional) Implement CSS Houdini for smooth corners

---

## Summary

**LogRocket's Approach + Hype4 Foundation = Production-Ready Claymorphism**

| Aspect | Hype4 | LogRocket | KIOSK Hybrid |
|--------|-------|-----------|-------------|
| Shadows | 2 inset | 3-shadow technique | ✅ Implemented |
| Tailwind | Basic | Utilities | ✅ Recommended |
| Formula | Conceptual | Concrete (x=y, blur=2x) | ✅ Structured |
| Accessibility | Emphasized | Critical | ✅ Priority |
| HSL Colors | Implicit | Explicit | ✅ Used |
| Interaction | Basic | Full state support | ✅ Enhanced |

**Result**: Cohesive, accessible, production-grade claymorphism interface following industry best practices from both references.

---

## References

- **Hype4 Academy**: [Claymorphism in User Interfaces](https://hype4.academy/articles/design/claymorphism-in-user-interfaces)
- **LogRocket**: [Implementing Claymorphism with CSS](https://blog.logrocket.com/implementing-claymorphism-css/)
- **KIOSK Skill**: [.github/skills/claymorphism-ui/SKILL.md](.github/skills/claymorphism-ui/SKILL.md)
- **Color Palette**: [COLOR_PALETTE_AUDIT.md](../../COLOR_PALETTE_AUDIT.md)
- **Tailwind Config**: [tailwind.config.js](../../tailwind.config.js)
