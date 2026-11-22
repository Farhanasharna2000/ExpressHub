# ExpressHub testing and requirements pack

Everything a QA engineer, product owner or security reviewer needs, kept next to the code.
Built from the repository at `main` = `48da479` on 2026-11-22.

| Folder or file | What it holds | Read it when |
|---|---|---|
| [PROMPT.md](PROMPT.md) | The prompt and rules that produced this pack | You want to regenerate or extend it |
| [reports/test-case-report.md](reports/test-case-report.md) | Results, verdict, test cases with IDs, defects, gaps, what was not run | You need to know if it is safe to release |
| [reports/test-inventory.md](reports/test-inventory.md) | Generated list of every automated test title | You need to find a test |
| [audit/github-issue-audit.md](audit/github-issue-audit.md) | Issues, PRs and repository settings audited against the code | You manage the project or its security |
| [requirements/user-stories.md](requirements/user-stories.md) | 30 stories by role with Given/When/Then criteria | You plan or accept features |
| [requirements/rtm.md](requirements/rtm.md) | Requirement to story, issue, code and test, with status | You need to prove something is tested |
| [security/rbac-matrix.md](security/rbac-matrix.md) | Role by page, role by API route, status rules, API-key scopes | You review access control |
| [diagrams/process-flow-swimlane.md](diagrams/process-flow-swimlane.md) | Swimlane flow and status lifecycle | You explain the business process |
| [diagrams/sequence-diagrams.md](diagrams/sequence-diagrams.md) | Six sequence diagrams: sign-in, book and pay, deliver, email outbox, merchant webhooks, refund | You trace a flow through the system |
| [tools/build-test-inventory.mjs](tools/build-test-inventory.mjs) | Script that builds the inventory | You change the tests |

Diagrams are Mermaid, so GitHub, VS Code and most Markdown viewers draw them.

## How the documents connect

```
user story (US-*)  <->  requirement (R-*)  ->  issue or PR  ->  code  ->  test file  ->  test case (TC-*)
```

The RBAC matrix and the sequence diagrams use the same role and route names as the code.
The audit lists the gaps that the other documents point to (A-01 and so on, G-1 and so on).

## Keeping it true

- Run `node testing/tools/build-test-inventory.mjs` after adding or removing tests.
- When a route is added, add one row to the RBAC matrix. The API-key allowlist in `lib/merchant/api-keys.ts` is also part of that review.
- When a feature is merged, add its story, requirement and test cases, and update the verdict in the report.
- Re-run the checks in section 8 of the test-case report and replace the numbers. Do not carry results forward.

## What this pack does not do

It reports and traces. It does not change application code, and it did not open, close or edit any GitHub issue.
The issues it proposes are listed in the audit for the owner to decide.
