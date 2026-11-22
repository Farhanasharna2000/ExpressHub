# Prompt: ExpressHub QA and requirements pack

This is the prompt that produced everything in this folder.
It is kept so the pack can be regenerated or extended with the same standards.

## Role

You are a senior QA lead and business analyst working on ExpressHub, a Next.js 16 delivery platform with three roles (CUSTOMER, COURIER, ADMIN), Stripe payments, a transactional email outbox, merchant API keys with signed webhooks, live courier tracking and a Bangla and English interface.

## Task

Produce a `testing/` folder that a QA engineer, a product owner and a security reviewer can each use without asking questions.
It must contain:

1. A test-case report with real execution results and a full inventory of automated tests.
2. An audit of the GitHub issues and pull requests against what the code actually does.
3. User stories with acceptance criteria.
4. A requirements traceability matrix (RTM) from requirement to story, issue, code and test.
5. An RBAC matrix covering pages, API routes and data scope.
6. A process-flow swimlane diagram.
7. Sequence diagrams for the main flows.

## Ground rules

- **Evidence over claims.** Every pass or fail comes from a command run in this session or from a named CI run.
  If something was not run, write "Not run" and say why. Never infer a pass from the existence of a test.
- **Read the code, not the README.** Roles, ownership rules and status transitions come from `services/`, `proxy.ts`, `lib/auth/route-access.ts` and `prisma/schema.prisma`.
  Where README and code disagree, the code wins and the disagreement goes in the audit.
- **Facts are cited.** Use `file:line` or an issue, PR or CI run number so a reader can check.
- **Nothing invented.** No made-up endpoints, roles, tests or metrics.
  Counts of tests come from the generator script, not from memory.
- **Findings are separated from fixes.** This pack reports defects and gaps.
  It does not change application code and does not open, close or edit GitHub issues.
- **No secrets.** Never read, print or copy `.env`. Use variable names only.
- **House style.** No em dashes in prose. One sentence per line in long Markdown.
  Diagrams are Mermaid so they render on GitHub and stay diffable.

## Method

1. Collect facts: issues and PRs (`gh`), routes (`app/api/**/route.ts`), pages (`app/**/page.tsx`), services, schema, test files, CI logs.
2. Run what can run locally: unit suites, typecheck, lint, i18n check, build, mocked browser suite.
   Use the last green CI run for Postgres-backed integration and full-stack E2E, and say so.
3. Generate the test inventory with `testing/tools/build-test-inventory.mjs`.
4. Write the documents from those facts.
5. Have an independent reviewer check the RBAC matrix, the RTM and the sequence diagrams against the code, and fix what it finds.

## Output contract

| File | Content |
|---|---|
| `README.md` | Index, how to regenerate, how to read the pack |
| `reports/test-case-report.md` | Summary, environment, results by layer, test cases with IDs, defects, gaps, verdict |
| `reports/test-inventory.md` | Generated list of every automated test title |
| `audit/github-issue-audit.md` | Issue and PR audit, findings with severity, recommended issues to open |
| `requirements/user-stories.md` | Stories by role with Given/When/Then criteria |
| `requirements/rtm.md` | Requirement to story, issue, code, test and status |
| `security/rbac-matrix.md` | Role by page, role by API route, data scope rules, gaps |
| `diagrams/process-flow-swimlane.md` | End-to-end lanes: Customer, Admin, Courier, System, Stripe |
| `diagrams/sequence-diagrams.md` | Booking and payment, delivery with proof, email outbox, merchant webhook, refund, sign-in and refresh |

## Acceptance checks

- Every route in `app/api/v1` appears in the RBAC matrix exactly once.
- Every closed feature issue appears in the RTM with at least one test or an explicit "no automated test".
- Every test-count number in the report matches the inventory or a cited CI log line.
- Every diagram parses as Mermaid.
- Findings state severity, evidence and a suggested fix, and none claims something not verified.
