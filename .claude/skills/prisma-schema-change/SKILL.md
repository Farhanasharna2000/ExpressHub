---
name: prisma-schema-change
description: Change the ExpressHub Prisma schema safely with a new migration, updated validators and services, and seeds. Use when adding or changing models, fields, enums or indexes in prisma/schema.prisma.
---

# Change the database schema

1. Edit `prisma/schema.prisma`. Follow existing naming, `@map` and index style.
2. Create a migration against a local development database only:
   ```bash
   npx prisma migrate dev --name <short_snake_case_name>
   ```
3. Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`. Make data backfills explicit and safe for existing rows.
4. Never edit or delete a migration that has already been applied anywhere.
5. Run `npm run prisma:generate`, then update validators, services and `types/api.ts` for the new shape.
6. Soft-deletable models need `deletedAt DateTime?` and every query must filter `deletedAt: null`.
7. Money fields use `Decimal` with an explicit precision, like the existing price columns.
8. Update `prisma/seed.mjs` or `prisma/seed-pricing.mjs` only when the seed data depends on the change.
9. Apply in other environments with `npm run prisma:migrate:deploy`, never `migrate dev`.
10. Run the `verify-change` skill, plus the related `test:*:integration` suite against a dedicated test database.
