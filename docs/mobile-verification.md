# Mobile-width verification — 2026-09-07

Environment: desktop Chrome with viewport overrides (390 × 844 and 320 × 740).
This is browser operation testing, not physical iOS/Android or touch-device certification.

Verified through visible browser controls:

- Home → Lesson 01 → Quiz; hints and immediate incorrect-answer explanations.
- 4/5 pass, selected/correct answers, result restoration after reload.
- Builder with incorrect Re-Observation → feedback_loop_missing.
- Edit restores the existing selection; corrected Builder completes and survives reload.
- Home reflects the passed lesson and its review candidate.
- Mobile navigation and glossary search (State).
- Leaving an in-progress quiz for the glossary and going Back restores the locked answer and count; remaining questions can be answered and submitted at 320px.
- No error-level browser logs were captured during this check.

Fixed during verification:

1. The sticky submit bar overlapped mobile navigation. Its mobile bottom offset now keeps the submission control above navigation.
2. Returning to an in-progress quiz rendered blank controls despite retained session answers. Rendering now restores answers, feedback, count and submit availability without changing grading or persisted state.

Limitations: not every lesson or stage was manually completed at mobile width. Automated renderer and domain regression tests cover all 12 lessons and 3 stages. A third-party dictionary extension injected a 380px iframe at 320px; the observed horizontal overflow belonged to that extension, not app content. Physical-device Safari/Chrome verification remains separate.
