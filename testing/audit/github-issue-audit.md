# GitHub issue and repository audit

Repository: `Farhanasharna2000/ExpressHub`, audited on 2026-11-22 at `main` = `48da479`.
Read-only: nothing was opened, closed, labelled or edited on GitHub.
Data came from `gh issue list`, `gh pr list`, `gh run list`, `gh api` and the code in this checkout.

## 1. Summary

| Measure | Result |
|---|---|
| Issues | 34 (numbers 2 to 35), all closed, 0 open |
| Pull requests | 3, all merged (#1, #36, #37) |
| Labels in use | 34 of 34 issues have at least one label (25 labels exist) |
| Assignees | 0 of 34 issues |
| Milestones | 0 of 34 issues |
| Issues closed by a pull request | 1 (#35 via #36). The other 33 were closed by a commit on `main` |
| CI on the last 12 runs | 11 success, 1 failure (run 44884540758, the forged-commit recovery commit) |
| Branch protection on `main` | None (the API returns 404 for protection and 0 rulesets exist) |
| Dependabot alerts | Disabled |
| Code scanning | No analysis found |
| `delete_branch_on_merge` | Off |

## 2. Findings

| ID | Severity | Finding | Evidence | Suggested action |
|---|---|---|---|---|
| A-01 | High | `main` has no branch protection or ruleset. Anyone with push rights, or a stolen token, can push or force-push straight to `main`, and CI cannot block a red change. This repo has already had its `main` overwritten twice by forged commits | `gh api .../branches/main/protection` returns 404, rulesets = 0, memory note on the two forged force-pushes | Require pull requests, require the `verify`, `integration` and `e2e` checks, block force pushes and deletions, require linear or signed history |
| A-02 | High | Dependabot alerts and code scanning are off, and secret scanning status could not be read (the token lacks `admin:repo_hook`). The project pins Next.js and Zod after advisories (issue #2), so new advisories would go unnoticed | `gh api .../dependabot/alerts` returns 403 "disabled"; code scanning returns "no analysis found" | Enable Dependabot alerts and security updates, enable secret scanning and push protection, add a CodeQL workflow |
| A-03 | Medium | Issue #33 (passkeys and two-factor sign-in) is closed with the comment "Skipped at the owner's request". No passkey or TOTP code exists in the repo (searched `app`, `lib`, `services`, `features`, `prisma`, `validators`). It is closed as completed, not as not-planned, so a reader of the issue list would assume it shipped | `gh issue view 33`, repo search | Reopen and label `wontfix` or close as "not planned". Keep it out of the RTM as "not built" |
| A-04 | Low | Issue #26 says the load test runs "in CI". It does not run on pull requests or pushes: `ci.yml` never calls k6. A separate `.github/workflows/load.yml` runs `k6 run tests/load/smoke.js` but only by hand (`workflow_dispatch`, needs a preview URL) | `grep -ci k6 ci.yml` returns 0; `load.yml` header says "Manual only" | Add a schedule to `load.yml`, or edit issue #26 to say the load test is manual |
| A-05 | Medium | 33 of 34 issues were closed by direct commits to `main`, not by pull requests. There is no review record and no CI result tied to those closes. The agreed workflow (issue, branch, PR, CI, merge) started with #35 | Issue timelines: #2, #8, #9, #22, #30 closed by a commit id; #35 by PR #36 | Keep the PR workflow for every feature. A-01 makes this enforceable |
| A-06 | Medium | PR #37 ("Bangla labels, failed-email polish and GSAP extras") has no linked issue, although the workflow starts every feature with an issue. Three features share one PR | `gh pr view 37` | Open a tracking issue for each feature before work, as for #35, and link with `Fixes #n` |
| A-07 | Low | No issue has an assignee or a milestone, so ownership and release grouping cannot be read from GitHub | 0 of 34 | Assign issues and group by release if a release process is wanted |
| A-08 | Low | `delete_branch_on_merge` is off, so merged feature branches stay until someone deletes them | `gh api repos/...` | Turn it on |
| A-09 | Low | The email retry sweeper runs once a day (`vercel.json`: `0 3 * * *`). Emails are also sent right after commit, but a failed send waits up to a day for its retry. README documents this as a Vercel Hobby limit | `vercel.json`, README line 334 | Acceptable on Hobby. Change to every few minutes on Pro |
| A-10 | Medium | README says emails are sent "with the row id as the provider's `Idempotency-Key`" (README line 327), but the Brevo sender sends no idempotency key and its own comment says Brevo's API has none. Duplicate protection rests only on the 5-minute lease and the SENT mark. If a send succeeds and the SENT update then fails, or the lease expires mid-send, the customer can get the same email twice. The README was written for the earlier Resend sender and was not updated | `services/notifications/sender.ts:46-47`, `services/notifications/dispatch.ts:9`, README line 327 | Correct the README. Optionally add a sent-marker check before resending, and a test for the send-succeeded-but-not-marked case |
| A-11 | Info | Issue #20 asked to shorten the page-session cookie from 30 days. The code now uses 24 hours (`lib/auth/tokens.ts:131`). The issue does not state a target, so the result is consistent with it | code and issue body | None |
| A-12 | Info | The only failed CI run in the recent window is the forged-force-push recovery commit, not a code failure | run 44884540758 | None |

## 3. Issue by issue

"Evidence" is where the delivered behaviour is checked today.
CI means the integration job's summary line in run 44986438589 (PR #37), which passed.
"Code" means I read the code in this audit.
"Not re-verified" means the issue is closed and a related test exists, but this audit did not read the code for it.

| # | Title | State | Delivered? | Evidence |
|---|---|---|---|---|
| 2 | Upgrade next and zod past advisories | Closed | Yes | `package.json` pins; A-02 on future advisories |
| 3 | Stop auth rate limits collapsing into one global bucket | Closed | Yes | `tests/auth.test.mjs`, `tests/rate-limit-diagnostics.test.mjs` (not re-verified) |
| 4 | Move Stripe refund calls out of the DB transaction | Closed | Yes | Code: `reserveRefund` then `sendRefund` in `payment.service.ts:627,685`; CI payment integration |
| 5 | Cancel or unblock shipments whose payment was refunded | Closed | Yes | CI: "refunds, expiry and uncertain-provider recovery" |
| 6 | CI workflow and aggregate `npm test` | Closed | Yes | `ci.yml`, `package.json` |
| 7 | Require current password to change email | Closed | Yes | Code: `user.service.ts:93-103`; CI user integration |
| 8 | Revoke all sessions when a refresh token is reused | Closed | Yes | Code: `auth.service.ts:148-183`; CI auth integration "replay rejection" |
| 9 | Content-Security-Policy on HTML pages | Closed | Yes | `next.config.ts`; `tests/security.test.mjs` |
| 10 | Stop mapping unknown payment errors by message text | Closed | Yes | `tests/payments.test.mjs` (not re-verified) |
| 11 | Age delayed shipments in the ops brief by last event | Closed | Yes | `tests/ai-ops-brief.test.mjs` (not re-verified) |
| 12 | Default model gemini-3.1-flash-lite | Closed | Yes | Code and README agree (`.env.example:25`, README 757) |
| 13 | Guard admin and archive dialogs against double submit | Closed | Yes | `tests/browser/admin.spec.ts` (not re-verified) |
| 14 | No assistant send on Enter while IME composing | Closed | Yes | Code: `features/ai/assistant-panel.tsx:135` |
| 15 | Payment buttons locked during redirect | Closed | Yes | `tests/browser/payments.spec.ts` (not re-verified) |
| 16 | Active filter state and icon button names for screen readers | Closed | Yes | `tests/e2e/accessibility.spec.ts` passes (24/24 in this session) |
| 17 | Date presets in one history entry, ops brief errors | Closed | Yes | Not re-verified |
| 18 | Validate incoming correlation IDs | Closed | Yes | Code: `lib/http/errors.ts:27-32` |
| 19 | `createRefund` required on `PaymentGateway` | Closed | Yes | Code: `lib/payments/*` interface has no optional marker |
| 20 | Shorten page-session role cookie | Closed | Yes | Code: 24 hours, A-11 |
| 21 | Public tracking with live updates | Closed | Yes | CI: tracking integration; `tests/e2e/motion.spec.ts` |
| 22 | Shipment emails through a transactional outbox | Closed | Yes | CI: notification integration |
| 23 | Admin analytics with charts and CSV | Closed | Yes | CI: analytics integration |
| 24 | Proof of delivery and installable courier app | Closed | Yes | CI: proof integration. The installable app part was not re-verified |
| 25 | AI help chat grounded in help articles, with evals | Closed | Yes | CI: help integration; `tests/evals/help.eval.mjs` needs a live model and was not run |
| 26 | E2E, accessibility and load testing in CI | Closed | Partly | E2E and accessibility run in CI. The load test is a manual workflow only (A-04) |
| 27 | Polish key screens with GSAP | Closed | Yes | `tests/e2e/motion.spec.ts` passes |
| 28 | Home hero showpiece | Closed | Yes | `tests/e2e/motion.spec.ts`, `language.spec.ts` pass |
| 29 | Live courier map | Closed | Yes | CI: courier-location integration; `tests/e2e/live-location.spec.ts` |
| 30 | Merchant API keys and signed webhooks | Closed | Yes | CI: merchant integration |
| 31 | Printable labels with QR codes and a scanner | Closed | Yes | CI: label integration; `tests/e2e/labels.spec.ts` passes |
| 32 | AI dispatch suggestions | Closed | Yes | CI: dispatch integration; `tests/e2e/dispatch.spec.ts` |
| 33 | Passkey and two-factor sign-in | Closed | **No** | Skipped, A-03 |
| 34 | Bangla and English interface | Closed | Yes | `tests/i18n.test.mjs` (13 pass), `language.spec.ts` passes |
| 35 | Bulk CSV import | Closed | Yes | CI: shipment import integration; `tests/e2e/bulk-import.spec.ts` |

Pull requests: #1 "Sharna" (baseline), #36 (bulk import), #37 (labels, failed-email panel, GSAP).

## 4. Issues worth opening

These are proposals only. None has been created.

| Proposed title | Labels | Source |
|---|---|---|
| Protect `main`: require PRs, required checks, no force push | `security`, `ci` | A-01 |
| Enable Dependabot, secret scanning and CodeQL | `security`, `dependencies` | A-02 |
| Reclassify issue #33 as not planned | `wontfix` | A-03 |
| Fix the README email-idempotency claim and test duplicate-send handling | `documentation`, `bug` | A-10 |
| Schedule the manual k6 workflow or document it as manual | `testing`, `ci` | A-04 |
| Add a payments list for admins (`GET /payments` returns only the caller's own) | `payments`, `api` | RBAC gap G-3 |
| Test the unhappy paths listed as gaps in the test-case report | `testing` | `reports/test-case-report.md` section 7 |
