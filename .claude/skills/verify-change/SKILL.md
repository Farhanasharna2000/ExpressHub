---
name: verify-change
description: Run the ExpressHub quality checks for a change and report real results. Use before saying a change is done, before committing, or when asked to verify the project.
---

# Verify a change

Run from the project root and report each command's actual result.

```bash
npm run lint         # 0 errors required; existing warnings are allowed
npm run typecheck
npm run test:frontend
```

Then run the suites for the area you touched:

| Area | Command |
| --- | --- |
| Auth, sessions, tokens | `UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= npm run test:auth` |
| Proxy, cookies, route protection | `npm run test:security` |
| Payments, Stripe | `npm run test:payments` and `npm run test:checkout-return` |
| Error envelope | `npm run test:errors` |
| AI assistant | `npm run test:ai` |
| API routes or docs | `node --test tests/postman.test.mjs` |
| Production build | `npm run build` |
| Browser flows | `npm run build && npm run test:frontend:browser` |

Integration suites (`npm run test:*:integration`) need a dedicated test database. Skip them and say why if none is configured.

## Reporting

- List each command with pass or fail and the counts it printed.
- For a failure, give the test name, the file and line, and the error.
- Never claim a pass you did not see.
