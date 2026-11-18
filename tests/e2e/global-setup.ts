import { PrismaClient } from "@prisma/client";
import { cleanupE2e, seedE2e } from "../../prisma/seed-e2e.mjs";
import { startUpstashStub } from "./support/upstash-stub.mjs";

// Must match the UPSTASH_* values playwright.e2e.config.ts gives the app server.
const upstashPort = Number(process.env.E2E_UPSTASH_PORT ?? 3299);
const upstashToken = "e2e-upstash-token";

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    // Start from a known state even if a previous run was interrupted.
    await cleanupE2e(prisma);
    await seedE2e(prisma);
  } finally {
    await prisma.$disconnect();
  }

  // Runs in the test runner process for the whole run; the returned function stops it.
  const stub = await startUpstashStub({ port: upstashPort, token: upstashToken });
  return () => new Promise<void>((resolve) => stub.close(() => resolve()));
}
