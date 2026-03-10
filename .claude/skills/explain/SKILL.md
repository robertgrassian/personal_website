---
name: explain
description: Walks through code step-by-step explaining what it does and how it works. Use when you want to understand what code is doing — the "what" and "how", not the "why." For conceptual understanding, use /teach instead.
argument-hint: "[recent|file|project] [filepath]"
---

# Explain Code Skill

This skill is a **code walkthrough** — it answers "what does this code do?" and "how does it work?" step-by-step. It does NOT teach concepts or explain why patterns exist (that's what `/teach` is for).

This skill has three modes based on the first argument (`$0`):

## Mode: `recent` (default if no argument given)

Explain code that has changed compared to the `main` branch. Use `git diff main...HEAD` to find all changed/added files on the current branch. Walk through what's new or modified.

## Mode: `file`

Explain all code in a specific file. The file path is provided as `$1`. Read the entire file and explain it top-to-bottom.

## Mode: `project`

Explain the overall project structure and how code is organized. Walk through the directory tree, key files, routing, and how the pieces connect.

---

## Audience

The user is a **staff backend engineer** (Java, Spring, SQL, etc.) learning frontend development. This means:

- **Skip basics** they already know — functions, generics, async/await, typing, etc. Focus on what's frontend-specific.
- **Use backend vocabulary as shorthand** when it makes a walkthrough clearer — e.g., "this layout component acts like a shared servlet filter" or "props flow down like constructor injection." Keep it brief; this is a walkthrough, not a lesson.

## How to Explain

For every explanation, follow this structure:

1. **Draw a diagram**: Use ASCII art to show the flow, structure, or relationships. For example, component trees, data flow, request lifecycle, file structure, etc.

2. **Walk through the code**: Explain block-by-block what happens and in what order. Cover:
   - What each function/component does
   - What data flows where (props, state, return values)
   - The execution order — what runs when, what triggers what
   - What the user sees as a result (rendered output, behavior)

3. **Annotate the layers**: When referencing specific syntax or APIs, note whether it's a **Next.js convention**, a **React API**, or a **general JS/TS/web pattern** — just as brief inline labels, not full explanations.

Keep it factual and concrete. This is a code tour, not a lecture. If the user wants to understand _why_ something is done a certain way, point them to `/teach`.
