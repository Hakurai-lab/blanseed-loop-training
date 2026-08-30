# BLANSEED Loop Training v1｜Implementation Handoff

Version: 1.0
Status: Ready for Implementation
Project: BLANSEED Loop Architecture Training
Next Phase: ⑦ Web App v1 Implementation

---

# 0. Purpose

この文書は、

設計Phase ①〜⑥で確定したBLANSEED Loop Training v1を、

実装専用ChatGPTチャットへ引き継ぐためのImplementation Handoffである。

次工程では設計をやり直さない。

目的：

Web App v1を実装する。

---

# 1. Product Goal

最終ゴール：

「BLANSEED Loop Architectureの基礎設計能力を身につけた状態」

AIを使わずに設計することは条件ではない。

AIと協働しながら、

・内容を理解
・良否判断
・誤り修正
・設計指示
・設計理由説明
・AI / Program / Rule / DB / Human責務判断

ができる状態を目指す。

---

# 2. Core Competencies

1. 目的
2. 現在状態 / 目標状態
3. Observation
4. State
5. Evaluation
6. Action
7. Feedback / Re-Observation
8. Short / Mid / Long Loop
9. Fact / Hypothesis
10. Diagram

Baseline：

0 / 10

---

# 3. Product Structure

1 Web App

2 Modules

Module A：

Loop Learning

Module B：

Loop Builder

Learning
↓
Quiz
↓
Builder
↓
Weakness
↓
Review
↓
Builder

を1つのTraining Loopとする。

---

# 4. Learning v1

必要機能：

・Lesson
・5問Quiz
・選択式
・自動採点
・誤答解説
・Review
・Spaced Review
・Interleaving
・Stage Exam
・Retention Check
・Concept State
・Progress保存

AI APIへ依存させない。

---

# 5. Learning State

Lesson：

```text
unstarted
learning
completed
```

Retention：

```text
unassessed
weak
review
stable
```

Concept Retention Level：

```text
R0
R1
R2
R3
```

初期Scheduling Rule：

R0 → 約1日

R1 → 約3日

R2 → 約7日

R3 → 約21〜30日

固定的科学最適値として扱わない。

---

# 6. Quiz

Lesson：

5問

通常：

4/5 Pass

重要Lesson：

5/5

Question Types：

single_choice

multiple_choice

true_false

classification

error_detection

scenario_judgement

sequence

---

# 7. CORE

01 Loop

02 Current / Target

03 Observation / Evaluation

04 State

05 Evaluation Rule

06 Action

07 Result / Feedback

08 State Update

09 Fact / Interpretation

10 Fact / Hypothesis

11 Hypothesis / Experiment

12 Correlation / Causation

13 Short Loop

14 Mid Loop

15 Long Loop

16 Loop Connection

17 Loop / Workflow

18 State Machine

19 Diagram

20 Multi Loop

---

# 8. Builder v1

Builder Steps：

1 Purpose

2 Current / Target

3 Observation

4 State

5 Evaluation

6 Action

7 Result / Feedback

8 Loop Levels

9 Fact / Hypothesis

10 Responsibility

11 Diagram

12 Review

---

# 9. Builder Practice

Mini Builder

Stage Builder

Full Builder

---

# 10. Builder Rubric

各能力：

0 未設計

1 不十分

2 基礎達成

3 安定

Learning Quiz合格だけでは能力習得としない。

---

# 11. AI Collaboration

AI API直接統合は不要。

v1：

Prompt作成
↓
Copy
↓
External AI
↓
Response Paste
↓
Adopt / Modify / Reject
↓
Reason保存

---

# 12. Responsibility Types

```text
human
program
rule
database
ai
external_system
```

---

# 13. Knowledge Types

```text
fact
interpretation
hypothesis
learning_candidate
```

AI推測をFactへ自動昇格させない。

---

# 14. Main UI

Navigation：

Home

Learn

Build

Progress

Curriculum

---

# 15. Home

表示：

基礎設計能力 X / 10

Next Action

Current Position

Review

Current Builder

大量Lesson一覧や総合%を中心表示しない。

---

# 16. Learning UI

Lesson

Quiz

Result

Review

Stage

Retention

---

# 17. Builder UI

Step Navigation

Step Editor

Rubric

AI Assistance

Diagram

Review

---

# 18. Data Domains

```text
Content
Learning
Builder
Competency
AI Interaction
App State
```

---

# 19. Static Data

```text
lessons
questions
stages
concepts
competencies
themes
rubrics
```

---

# 20. User Data

```text
lessonProgress
conceptStates
stageProgress
questionHistory
learningActivities

builderProjects

competencyRecords

builderWeaknessEvents

aiInteractions
```

---

# 21. Persistence

v1はLocal First。

Login不要。

Cloud不要。

基本：

Static Content JSON

User State localStorage

Builder Data localStorageまたはIndexedDB

必要ならJSON Export / Import。

---

# 22. Offline

Learning

Quiz

Builder

Progress

はOfflineで利用可能。

AI Assistanceだけ外部AIへ接続。

---

# 23. v1では実装しない

Dark Mode

Cloud Sync

Login

Multi User

AI API

Multi-Agent

Advanced Graph Visualization

Animation polish

Leaderboard

Social

高度Spaced Repetition

---

# 24. v1 Definition of Done

Learning：

✓ Lesson

✓ 5問Quiz

✓ 採点

✓ 誤答解説

✓ Review

✓ Weak Concept

✓ Stage Exam

✓ Retention

✓ 保存

Builder：

✓ Theme

✓ 10能力

✓ Components

✓ Connections

✓ Short / Mid / Long

✓ AI Prompt

✓ AI Response Record

✓ Adopt / Modify / Reject

✓ Reason

✓ Diagram

✓ Rubric

✓ 保存

Integration：

✓ Builder Weakness → Learning

✓ Learning State → Competency

✓ Builder State → Competency

✓ Dashboard Next Action

---

# 25. 80% Rule

v1の目的：

「基礎設計能力を学べること」

UIの完成度を最大化することではない。

学習効果または操作不能に直接関係しない改善は後回し。

---

# 26. Implementation Order

推奨実装順：

Phase 1

App shell
Navigation
Persistence
Static Data Loader

Phase 2

Lesson
Quiz
Scoring
Question History

Phase 3

Concept State
Review Scheduler
Stage Exam

Phase 4

Builder Steps
Builder Save

Phase 5

Diagram
Rubric

Phase 6

AI Prompt Copy / Response Paste

Phase 7

Builder Weakness → Learning

Phase 8

Competency State
Dashboard

Phase 9

Retention Check
Export / Import

Phase 10

Bug Fix
Mobile verification
80% release check

---

# 27. Implementation Principle

実装時に、

設計を勝手に変更しない。

ただし、

技術的に実装不能
重大なUX問題
データ破損リスク
設計矛盾

を発見した場合は、

問題
影響
推奨修正

を提示してから変更する。

細かなUI判断は、

80/20を優先して実装側で決めてよい。

---

# 28. Initial Development Target

最初に完成させるVertical Slice：

Home
↓
Lesson 01
↓
5 Question Quiz
↓
Score
↓
Concept State Update
↓
Mini Builder
↓
Weakness
↓
Home

これを最初にEnd-to-Endで動作させる。

その後20 Lessonへ拡張する。

---

# 29. Critical Rule

最初から42 LessonすべてのContent作成に着手しない。

まず：

CORE Lesson 01

Quiz

Mini Builder

State Update

Integration

まで動かす。

Architectureが成立した後にLesson Contentを増やす。

これは80/20ルールに従う。

---

# 30. Implementation Start Instruction

次のチャットでは、

「BLANSEED Loop Training v1｜Implementation Handoff」

をSingle Source of Truthとして扱う。

設計Phase ①〜⑥へ戻らず、

⑦ Web App v1 Implementation

を開始する。

最初の実装対象：

Vertical Slice v0.1

Home
→ Lesson 01
→ Quiz
→ Result
→ Concept State
→ Mini Builder
→ Weakness
→ Home

以上。
