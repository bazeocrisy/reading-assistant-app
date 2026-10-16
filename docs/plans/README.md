# ReadUp plans

This folder holds ReadUp's version-controlled implementation plans. GitHub is the system of record.

| Date | Status | Document | Based on |
|---|---|---|---|
| 2026-10-16 | **Proposed, awaiting owner review** | [`2026-10-16-roadmap/ROADMAP.md`](2026-10-16-roadmap/ROADMAP.md): the **single coordinated roadmap** | The baseline audit (PR #4, `docs/audits/2026-10-16-baseline/`) |

The roadmap replaces the earlier draft plan in PR #5.

## Roadmap contents

- **[`ROADMAP.md`](2026-10-16-roadmap/ROADMAP.md)** covers:
  - principles, including free access without an account and protection for paid AI
  - **data and account preservation**, required before any sign-in or database change
  - dependencies
  - phases P0–P9, each with its PRs, risks, rollback steps, acceptance tests and approval checkpoints
  - recurring operating costs, with the assumptions behind them
  - the PR catalogue
  - decisions needed and items not yet verified
- **[`workstreams/`](2026-10-16-roadmap/workstreams/)** has the item-level detail. For each item it gives:
  - the problem, with evidence
  - the change
  - the tests
  - the impact on existing features
  - rollback, approvals and effort

  It contains:
  - `plan-security.md` + `addendum-security.md`: cost protection and security (SEC)
  - `plan-free-first.md` + `addendum-free-first.md`: free-first core learning (FREE)
  - `plan-qa-testing.md` + `addendum-qa.md`: repairs and automated testing (QA)
  - `plan-ux-data.md` + `addendum-ux-data.md`: homepage, accessibility and data preservation (UX / A11Y / DATA), plus guest mode (G-1 to G-4)

File:line references point to `main` @ `eec9e78`.
