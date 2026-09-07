# AGENTS.md

## Project

This project is **BLANSEED Loop Training v1**.

## Canonical Repository

- The sole update destination for this project is `https://github.com/Hakurai-lab/blanseed-loop-training`.
- Do not update `blanseed-loop-training-web` or any other repository for this project unless the user explicitly changes this rule.
- Before pushing or publishing, verify that the Git remote targets `Hakurai-lab/blanseed-loop-training`. If it differs, stop and report the mismatch; do not silently overwrite the remote.
- The public application URL is `https://hakurai-lab.github.io/blanseed-loop-training/`.
- This destination rule does not itself authorize a push or publication; follow the user's authorization for the current task.

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

## Confirmed Decisions

- The current approved specification is the product baseline, not a temporary prototype. The language and learning-content rules below are mandatory for existing and future lessons, quizzes, and builders. Change them only on the user's explicit request.
- Always present learner-facing English terminology as `日本語（English）`, including headings, instructions, choices, hints, explanations, and results. Keep internal identifiers and saved values unchanged.
- Break learning points into plain Japanese actions and short explanations: what it is for, what to do, and what to check next. Use the approved step-by-step flow where applicable; adding a translation alone is not sufficient.
- Before reporting a content change complete, verify these rules in the affected rendered learning, quiz, and builder screens. Preserve approved explanations during refactoring and expansion.
- The current cosmic terrarium visual design is approved and locked. Do not change the header, footer, Home hero, cards, buttons, icons, imagery, palette, spacing, or visual direction unless the user explicitly requests a design change.
- Preserve every explicitly approved learning-flow and content decision. Do not silently remove or replace approved explanations during later refactors or lesson expansion.
- Show learner-facing Concepts in Japanese-first form everywhere: `日本語（English）`, such as `現在の状態（State）` and `目標の状態（Target）`. Apply this to lessons, quizzes, results, builders, weakness feedback, and review screens.
- The “何のために使うか” explanation must be understandable in simple Japanese without requiring the learner to already know the English terminology.
- Present each lesson's core flow as a plain Japanese action, its English Concept in parentheses, and one short explanation of what happens at that step.
- Prefer natural, direct Japanese. Avoid sentences that force the learner to translate several English terms before understanding the point.

## Current Status

The data-driven Training Engine, Lessons 01–12, Stage 01–03 data, dashboard, Concept reference, learning records, and the approved cosmic terrarium visual system are implemented. Preserve the working Vertical Slice and confirmed decisions while extending the project.
