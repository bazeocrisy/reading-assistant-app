# ReadUp plans

This folder holds version-controlled implementation plans. GitHub is the system of record.

| Date | Status | Folder | Based on |
|---|---|---|---|
| 2026-10-16 | **Proposed, awaiting owner review** | [`2026-10-16-implementation/`](2026-10-16-implementation/IMPLEMENTATION-PLAN.md) | Baseline audit, PR #4 (`docs/audits/2026-10-16-baseline/`, which resolves on `main` once PR #4 is merged) |

## Contents of the 2026-10-16 plan

- [`IMPLEMENTATION-PLAN.md`](2026-10-16-implementation/IMPLEMENTATION-PLAN.md): the consolidated, prioritized plan. It covers milestones M0–M9, PR order, approval gates, acceptance criteria and owner decisions.
- [`plan-security.md`](2026-10-16-implementation/plan-security.md): SEC items. Cost protection, function lockdown, database rules, XSS and privacy mechanisms.
- [`plan-free-first.md`](2026-10-16-implementation/plan-free-first.md): FREE items. Browser read-aloud, offline dictionary, fallback stories, optional AI.
- [`plan-qa-testing.md`](2026-10-16-implementation/plan-qa-testing.md): QA items. Zero-install test tiers, CI, branch protection and confirmed-broken repairs.
- [`plan-ux-data.md`](2026-10-16-implementation/plan-ux-data.md): UX, A11Y and DATA items. Grades 4–5, wording, accessibility, PIN, backup, homepage redesign and Comprehension preservation.

Every item lists:
- the problem it solves, with evidence
- the change
- how it will be tested
- its impact on existing functionality
- rollback
- the approvals it needs
- effort

File:line references point to `main` @ `eec9e78`.
