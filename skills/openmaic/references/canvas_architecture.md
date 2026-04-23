# Canvas Architecture & Text Rendering

This document serves as a persistent knowledge base for generating interactive Canvas simulations and handling long text rendering within OpenMAIC.

## 1. Native Interactive Scenes (The Correct Architecture)

**DO NOT** attempt to inject complex HTML or interactive simulations into a standard `slide` scene using JSON hacks (like the old `FULL_WIDGET` layout or regex HTML extraction). Forcing the AI to mix JSON structure with 200+ lines of HTML leads to silent parser failures, hallucinations, and repetitive slide layouts.

**Correct Approach:** OpenMAIC has a native `interactive` scene type.
To generate a simulation, instruct the Stage 1 Planner (in `app/page.tsx` via `deepInteractionHint`) to output a scene with `type: "interactive"`. 
- This bypasses the JSON slide parser entirely.
- It triggers `generateInteractiveContent` in `scene-generator.ts`.
- The frontend natively renders it fullscreen via `<InteractiveRenderer />` using `srcDoc`.

## 2. Canvas 2D Best Practices (Preventing Blank Screens)

When the AI generates the pure HTML for the `interactive` scene, it often correctly sets up the physics and DOM but fails to render the Canvas properly (resulting in a blank or smeared blue screen). 

The system prompt for interactive scenes (`lib/generation/prompts/templates/interactive-html/system.md`) MUST strictly enforce these Canvas 2D rules:
- **Animation Loop**: Always use `requestAnimationFrame` for physics and rendering.
- **Clear Canvas**: Always call `ctx.clearRect(0, 0, canvas.width, canvas.height)` at the start of every frame.
- **Resize Handling**: Always attach a `resize` event listener to window to update `canvas.width` and `canvas.height` to match `innerWidth`/`innerHeight`.

## 3. Text Element Overflow Handling

When standard `slide` scenes contain too much text, mathematical font scaling (`Math.floor(Math.sqrt(...))`) is insufficient because it caps at 14px. If the AI generates multiple paragraphs, the text will truncate/clip visually due to CSS constraints.

**Solution:** Do not try to solve this by coercing the AI via prompt engineering. Instead, rely on CSS. 
Ensure `components/slide-renderer/components/element/TextElement/index.tsx` uses:
```css
overflow-y: auto;
overflow-x: hidden;
```
This guarantees that any excess text naturally generates a scrollbar within the absolute positioned box, preserving the slide layout without losing information.
