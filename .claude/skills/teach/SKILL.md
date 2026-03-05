---
name: teach
description: Teaches the concepts and "why" behind your code or a frontend topic. Use when you want to understand why things are done a certain way, build mental models, and level up. For a code walkthrough of "what does this do", use /explain instead.
argument-hint: "[recent|file|topic] [filepath or topic name]"
---

# Teach Skill

This skill is a **concept lesson** — it answers "why is it done this way?" and "what should I understand about this?" It does NOT walk through code line-by-line (that's what `/explain` is for). Instead, it extracts the concepts from the code and teaches them.

This skill has three modes based on the first argument (`$0`):

## Mode: `recent` (default if no argument given)

Teach the concepts behind code that has changed compared to the `main` branch. Use `git diff main...HEAD` to find all changed/added files on the current branch. Identify the frontend concepts and patterns at play — don't narrate the code itself.

## Mode: `file`

Teach the concepts used in a specific file. The file path is provided as `$1`. Read the file to identify concepts, but focus the response on the concepts, not a walkthrough.

## Mode: `topic`

Teach a specific frontend concept (e.g., `/teach topic "server components"`, `/teach topic "hooks"`). No code reading needed — just a focused lesson, grounded in examples from this project when possible.

---

## Output Structure

Use this exact structure with these exact `##` headers so the output is scannable and the user can jump to sections. Use `---` horizontal rules between top-level sections for visual separation.

### `## TL;DR`

2-3 sentence summary: what concepts are in play, what's most important to understand, and what layer of the stack they belong to. This orients the reader before they dive in.

### `## Concepts at a Glance`

A table that serves as a table of contents. Each row is a concept with its layer tag and a one-line summary. The user reads this to decide which deep-dives to read.

| Concept           | Layer     | One-liner                                       |
| ----------------- | --------- | ----------------------------------------------- |
| Server Components | [Next.js] | Renders on the server, ships zero JS to browser |

Layer tags:

- **[React]** — hooks, component model, state, effects, etc.
- **[Next.js]** — App Router, server components, file-based routing, etc.
- **[Web]** — DOM, events, fetch, CSS, etc.
- **[JS/TS]** — JavaScript or TypeScript language feature
- **[Tailwind]** — Tailwind CSS pattern

### `## Deep Dive` (one per concept)

Each concept gets its own `### Concept Name [Layer]` sub-header. Separate each concept with a `---` horizontal rule so they are visually distinct. Within each:

- **Why does this exist?** — What problem it solves. What the world was like before it.
- **Why here?** — Why it's the right tool in this specific code.
- **Backend bridge** (only when it genuinely clarifies) — Connect to Java/Spring/backend equivalents. Don't force these. Examples of good parallels:
  - React components ↔ reusable UI templates (like Thymeleaf fragments, but with state)
  - `useEffect` ↔ `@PostConstruct` / lifecycle hooks in Spring
  - Server components ↔ Spring MVC controller returning a rendered view
  - Props ↔ constructor injection / method parameters
- **Diagram** (when it helps) — ASCII art showing data flow, component trees, server/client boundaries, lifecycle, etc. Embed diagrams inside the relevant concept, not in a separate section.

### `## Watch Out`

Gotchas and pitfalls, each as a short titled bullet. Focus on mistakes a backend engineer is likely to make:

- Things that work differently than expected from server-side thinking
- React/Next.js foot-guns (stale closures, unnecessary re-renders, hydration mismatches, etc.)
- Patterns that _look_ right but are anti-patterns

### `## What to Explore Next`

1-3 related concepts or natural next steps, framed as questions:

- "Now that you've used `useState`, you might want to explore: _When should I use `useReducer` instead?_"
- "You're rendering a list — next concept: _Why does React need `key` props, and what happens if you get them wrong?_"

---

## Guidelines

- Do NOT walk through code line-by-line — reference specific lines only to anchor a concept.
- The goal is lasting understanding of patterns and principles, not narration of today's code.
- Keep the tone conversational and encouraging.
- If the user wants a code walkthrough, point them to `/explain`.
