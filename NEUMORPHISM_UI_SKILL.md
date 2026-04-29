# Skill: Neumorphism UI Improvement & Color Palette

**Purpose**: Systematically enhance UI components with neumorphic design principles and establish a refined color palette for KIOSK-SP2.0.

**Scope**: Project-specific for KIOSK-SP2.0 | Quick checklist workflow

**Related**: Complements existing `CLAYMORPHISM_DESIGN.md` system

---

## What is Neumorphism?

Neumorphism ("new" + "skeuomorphism") combines soft UI aesthetics with realistic depth:
- **Unified color scheme** - Background and elements use similar, muted tones
- **Dual shadows** - Inset (dark) and outset (light) shadows create depth
- **Soft, rounded shapes** - Organic appearance with generous border-radius
- **Minimal contrast** - Subtle, low-saturation color palettes
- **Embossed/Debossed effect** - Elements appear pressed or raised

---

## Quick Checklist: Neumorphism Implementation (5 Steps)

### Step 1: Establish Color Palette ✓
**Goal**: Define a unified base with subtle accents

- [ ] **Choose base color**: Select a neutral tone (light gray, warm beige, or soft blue)
  - **SELECTED - Warm**: `#f4ede4` or `#ede4db` for cozy feel ✓
  - Light: `#f5f3f0` or `#e8e6e1` for modern feel
  - Cool: `#e8ecf1` or `#dfe3e8` for professional feel

- [ ] **Define 3-5 accent colors**: Keep saturation ≤ 60%, lightness 45-70%
  - Primary action: `#8b7d78` or `#a8d5ba`
  - Secondary: `#c8b8e4` (soft lavender)
  - Status indicators: Sage, Coral, Lavender variations
  - **Accessibility check**: Ensure 4.5:1 contrast ratio for text

- [ ] **Create CSS variables** in `index.css`:
  ```css
  :root {
    --neomorph-bg-primary: #f5f3f0;
    --neomorph-bg-secondary: #faf8f5;
    --neomorph-shadow-dark: rgba(90, 75, 75, 0.15);
    --neomorph-shadow-light: rgba(255, 255, 255, 0.8);
    --neomorph-accent: #a8a898;
    --neomorph-text-primary: #383838;
    --neomorph-text-secondary: #a8a898;
  }
  ```

---

### Step 2: Design Dual Shadow System ✓
**Goal**: Create inset and outset shadows for depth illusion

- [ ] **Outset shadow** (element raised) - BOLD EFFECT:
  ```css
  box-shadow: 
    10px 10px 20px var(--neomorph-shadow-dark),
    -10px -10px 20px var(--neomorph-shadow-light);
  ```

- [ ] **Inset shadow** (element pressed/focused) - BOLD EFFECT:
  ```css
  box-shadow: 
    inset 6px 6px 12px var(--neomorph-shadow-dark),
    inset -6px -6px 12px var(--neomorph-shadow-light);
  ```

- [ ] **No-shadow state** (flat):
  ```css
  box-shadow: none;
  ```

- [ ] **Create shadow utility classes** in CSS:
  - `.shadow-neomorph-raised`
  - `.shadow-neomorph-pressed`
  - `.shadow-neomorph-flat`

---

### Step 3: Update Component Styles ✓
**Goal**: Apply neumorphic principles to core components

**Priority order** (Riskiest → Safest):
1. Cards/Containers → Buttons → Input Fields → Badges

- [ ] **Cards** (`src/components/`):
  - Border-radius: 24-32px (organic)
  - Background: `var(--neomorph-bg-secondary)`
  - Shadow: Raised state by default
  - Transition: Smooth 0.3s cubic-bezier
  
- [ ] **Buttons** (`components/`):
  - Primary: Raised with accent color
  - Hover: Increase shadow depth (more raised)
  - Active: Inset shadow (pressed feel)
  - Focus: Add subtle color highlight

- [ ] **Input Fields** (`components/`):
  - Background: Slightly darker than page
  - Border: Subtle or none
  - Focus: Switch to inset shadow + accent highlight
  - Placeholder: Use secondary text color

- [ ] **Badges/Status Indicators**:
  - Keep existing logic (Success/Warning/Danger)
  - Apply softer shadow effect
  - Reduce saturation for consistency

---

### Step 4: Test Accessibility & Contrast ✓
**Goal**: Ensure usability for all users

- [ ] **Color contrast check**:
  - Text on background: Minimum 4.5:1 ratio
  - Interactive elements: Clearly distinguishable
  - Test with: WebAIM Contrast Checker or Chrome DevTools

- [ ] **Shadow depth check**:
  - Elements clearly raised/pressed/flat
  - Not relying on color alone for state indication
  - Sufficient visual separation

- [ ] **Motion sensitivity**:
  - Transitions ≤ 0.3s (avoid eye strain)
  - Test `prefers-reduced-motion` media query:
    ```css
    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.01ms !important; }
    }
    ```

---

### Step 5: Refinement & Performance ✓
**Goal**: Polish and optimize

- [ ] **Browser compatibility**:
  - Test in Chrome, Firefox, Safari (shadows may vary slightly)
  - Ensure fallback for older browsers

- [ ] **Performance check**:
  - No excessive shadow blur on mobile
  - Simplify shadows on low-end devices if needed

- [ ] **Documentation**:
  - Update component library
  - Document color variables
  - Record shadow presets

---

## Implementation Priority Matrix

| Component | Complexity | Impact | Priority |
|-----------|-----------|--------|----------|
| Cards     | Low       | High   | **1**    |
| Buttons   | Low       | High   | **1**    |
| Inputs    | Medium    | High   | **1**    |
| Badges    | Low       | Medium | **1**    |
| Modals    | Medium    | High   | **2**    |
| Navigation| Medium    | Low    | **2**    |

**Note**: All components apply simultaneously for cohesive design experience

---

## CSS Foundation Template

Add to `src/index.css`:

```css
/* Neumorphism Base System */
:root {
  --neomorph-radius: 24px;
  --neomorph-transition: cubic-bezier(0.34, 1.56, 0.64, 1);
  --neomorph-duration: 0.3s;
  
  /* Colors - Warm Palette Selected */
  --neomorph-bg-primary: #f4ede4;
  --neomorph-bg-secondary: #faf8f5;
  --neomorph-shadow-dark: rgba(139, 125, 120, 0.20);
  --neomorph-shadow-light: rgba(255, 255, 255, 0.85);
  --neomorph-accent: #a8a898;
  --neomorph-text-primary: #4a3f38;
  --neomorph-text-secondary: #8b7d78;
}

/* Shadow utilities */
.shadow-neomorph-raised {
  box-shadow: 
    10px 10px 20px var(--neomorph-shadow-dark),
    -10px -10px 20px var(--neomorph-shadow-light);
  transition: all var(--neomorph-duration) var(--neomorph-transition);
}

.shadow-neomorph-pressed {
  box-shadow: 
    inset 6px 6px 12px var(--neomorph-shadow-dark),
    inset -6px -6px 12px var(--neomorph-shadow-light);
}

.shadow-neomorph-flat {
  box-shadow: none;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Example Prompts to Use This Skill

1. **Quick apply**: 
   - "Apply neumorphism style to the FacultyDashboard card components using this skill"
   - "Implement neumorphic buttons following Step 3 of the Neumorphism UI Skill"

2. **Component specific**:
   - "Enhance AdminDashboard with neumorphic color palette and shadows"
   - "Update the KioskView following the neumorphism skill checklist"

3. **Full workflow**:
   - "Execute the complete Neumorphism UI Skill workflow on the entire component suite"

---

## Related Skills to Create Next

1. **Responsive Design Enhancement** - Adapt neumorphic shadows for mobile
2. **Dark Mode Neumorphism** - Create dark variant color palette
3. **Animation & Transitions** - Neumorphic hover/active state effects
4. **Performance Optimization** - Optimize shadow rendering for large component trees
5. **Accessibility Audit** - Full WCAG compliance check for neumorphic designs

---

## Notes & Tips

- **Shadow softness**: Bold 20px blur radius creates pronounced depth effect ✓ SELECTED
- **Color unity**: Warm palette `#f4ede4` provides cohesive, inviting aesthetic ✓ SELECTED
- **Testing**: Preview changes in both light and dark contexts
- **Simultaneous rollout**: Apply to all components at once for design consistency
- **Fallback**: Ensure designs degrade gracefully on older browsers

---

**Last Updated**: April 28, 2026  
**Status**: Ready for implementation  
**Difficulty**: Intermediate | **Time Estimate**: 2-4 hours per component
