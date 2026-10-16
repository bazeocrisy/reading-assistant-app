# ReadUp audits

This folder holds the version-controlled audit records for ReadUp. GitHub is the system of record; local copies are working files only.

| Date | Baseline commit | Folder | Summary |
|---|---|---|---|
| 2026-10-16 | `main` @ `eec9e78` | [`2026-10-16-baseline/`](2026-10-16-baseline/READUP-AUDIT-REPORT.md) | First multi-agent product and technical audit: architecture and security, student UI/UX, reading instruction, QA and accessibility, cost and privacy. Read-only; no code changed. |

## Baseline audit contents

- [`READUP-AUDIT-REPORT.md`](2026-10-16-baseline/READUP-AUDIT-REPORT.md): the consolidated report, in 14 sections with P0–P3 priorities.
- [`agent1-architecture.md`](2026-10-16-baseline/agent1-architecture.md): architecture, Firebase, Cloud Functions, allowed origins, security, data model.
- [`agent2-uiux.md`](2026-10-16-baseline/agent2-uiux.md): screen map, child, parent and teacher UX, contrast, proposed homepage.
- [`agent3-instruction.md`](2026-10-16-baseline/agent3-instruction.md): content inventory, how well it matches reading research, placement, wording of estimated levels.
- [`agent4-qa.md`](2026-10-16-baseline/agent4-qa.md): feature inventory and health, static checks, accessibility defects, test plan and acceptance criteria.
- [`agent5-cost-privacy.md`](2026-10-16-baseline/agent5-cost-privacy.md): paid dependencies, cost estimates, behaviour with no paid services, privacy/COPPA considerations.

## Conventions

- **Status labels:**
  - CONFIRMED WORKING or CONFIRMED BROKEN: verified by a check that was actually run.
  - SUSPECTED PROBLEM: code evidence only, not run.
  - NOT TESTED.
- **Evidence labels:**
  - EVIDENCE: seen in code, with a file:line reference.
  - INFERENCE / ASSUMPTION: needs a runtime, console or user check.
- **Priorities:**
  - P0: critical.
  - P1: important.
  - P2: improvement.
  - P3: future opportunity.
- **What never goes in these documents:** secrets, API keys or personal student information. The public Firebase web key is always shown redacted.
- File:line references point to the baseline commit named above. Line numbers will drift as the code changes.
- Cost figures are estimates from public pricing on the audit date. Nothing in these documents is legal advice.
