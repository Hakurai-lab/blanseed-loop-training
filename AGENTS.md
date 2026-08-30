# AGENTS.md

## Project

This project is **BLANSEED Loop Training v1**.

## Core Principles

- Do not change the design specification without explicit approval.
- Prioritize the 80/20 rule: focus on the smallest amount of work that delivers the greatest user value.
- Complete the minimum viable Vertical Slice before expanding the product.
- Keep Learning, Quiz, and scoring independent of AI APIs.
- Use a Local First architecture.
- Prefer simple, maintainable implementations over clever or overly abstract solutions.
- Do not implement all CORE 20 Lessons before the first Vertical Slice is complete.

## v1 Non-Goals

Do not implement the following in v1:

- Login or user authentication
- Cloud Sync
- Direct AI API integration

Do not introduce scaffolding, dependencies, abstractions, or infrastructure for these non-goals unless the user explicitly approves a design change.

## Design Change Protocol

If a design change appears necessary, stop before making the change and present:

1. **Problem** — what cannot be achieved under the current design and why.
2. **Impact** — the effect on scope, behavior, data, architecture, schedule, and maintenance.
3. **Recommended Change** — the smallest proposed change and its rationale.

Wait for explicit approval before changing the design specification or implementing the proposed change.

## First Implementation Target

The first implementation must be the following end-to-end Vertical Slice:

```text
Home
→ Lesson 01
→ 5-question Quiz
→ Result
→ Concept State Update
→ Mini Builder
→ Weakness Detection
→ Home
```

Keep this slice functional, local, and end-to-end. Do not broaden implementation to the full CORE 20 Lessons until this flow is complete and verified.

## Implementation Guidelines

- Keep changes focused on the requested task.
- Preserve user-authored and unrelated changes.
- Prefer small, reviewable edits over broad rewrites.
- Add dependencies or tooling only when required by the current Vertical Slice.
- Follow established project conventions once source code exists.
- Add focused tests alongside behavior when a test framework is available.
- Run the most relevant available checks before handoff and report anything that could not be verified.
- Never commit secrets, credentials, local environment files, or machine-specific artifacts.

## Current Status

The repository is an empty project scaffold. Do not begin application implementation until the user explicitly requests it.
