# Morning Report - Design Guidelines

## Design Approach
**Utility-focused audio application** - The primary interaction is playing the daily news report. Visual design should be clean, professional, and not distract from the audio experience.

## Core Design Principles
1. **Audio-First Experience**: All content fits without scrolling; the play button is the hero
2. **Responsive Duality**: Separate optimized layouts for landscape and portrait orientations
3. **Warm, Morning Aesthetic**: Professional warmth complementing the sunrise imagery

## Layout System

### Spacing
Use Tailwind units: **4, 6, 8, 12** for consistent rhythm
- Landscape: More horizontal breathing room (px-12, py-8)
- Portrait: More vertical stacking (px-6, py-12)

### Viewport Strategy
- **Landscape**: Single viewport height (h-screen) with no scrolling
- **Portrait**: Single viewport height (h-screen) with no scrolling
- Text report container: Scrollable within its allocated space only

### Layout Structure

**Landscape Layout:**
```
[Sunrise Image - Left 45%] | [Controls & Report - Right 55%]
                           | - Logo/Title (top)
                           | - Play Button (prominent, centered)
                           | - Report Text Window (scrollable, flexible height)
                           | - Copy Button
```

**Portrait Layout:**
```
[Sunrise Image Header - 35% height]
[Logo/Title - 10%]
[Play Button - Prominent - 15%]
[Report Text Window - Scrollable - 35%]
[Copy Button - 5%]
```

## Typography
- **Headings**: Clean sans-serif (Inter, Poppins) - 2xl to 4xl for "Morning Report" title
- **Body Text**: Readable serif or sans-serif - base to lg for report content
- **Hierarchy**: Title (bold), Date/time (medium), Report text (regular)

## Component Library

### Play Button
- Large, circular or rounded rectangular
- Prominent size (min 80px desktop, 64px mobile)
- Play/pause icon with clear affordance
- Elevated appearance (shadow/border)
- Background: Warm accent (sunset orange/gold) with blur if over image

### Text Report Window
- Subtle border or card treatment
- Internal scroll only (overflow-y-auto)
- Padding: p-6
- Line-height: relaxed (leading-7)
- Max height calculated to fit viewport

### Copy Button
- Small, understated below report
- Icon + "Copy Report" text
- Success state feedback

### Audio Playback Indicator
- Progress bar or subtle waveform visualization
- Time elapsed/remaining
- Volume control (optional, subtle)

## Color Palette (Warm Morning Theme)
Since colors aren't specified in hex, reference warm sunrise tones:
- **Primary warm accents**: Sunrise oranges, golden yellows
- **Neutral base**: Warm off-whites, soft browns
- **Text**: Deep browns or near-black for readability
- **Backgrounds**: Cream/warm white to complement sunrise image

## Images

### Hero Image
**Provided Sunrise Image** (5AF2695B-E8B8-4B82-8643-ABA26156A923_1762616797567.png)
- Landscape: Left panel (40-45% width, full height)
- Portrait: Top section (35% viewport height)
- Treatment: No overlay needed; maintains full vibrancy
- Position: object-cover to maintain aspect ratio

## Accessibility
- Play button: Minimum 44x44px touch target
- Keyboard navigation: Space/Enter to play/pause
- ARIA labels for all interactive elements
- Sufficient contrast ratios for text over backgrounds
- Focus indicators on all controls

## Animation (Minimal)
- Audio intro fade-in/fade-out: Handled programmatically
- Button hover states: Subtle scale or shadow change
- NO scrolling animations or parallax effects
- Report load: Simple fade-in if needed

## Key Implementation Notes
1. **No forced scrolling**: Entire interface visible within viewport at all times
2. **Responsive breakpoint**: ~768px switches between landscape/portrait layouts
3. **Report window**: Only scrollable element on page (internal scroll)
4. **Professional tone**: Clean, minimalist UI that doesn't compete with content
5. **Audio priority**: Visual hierarchy emphasizes the play experience over reading