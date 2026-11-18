import { PrismaClient } from "@prisma/client";
import { cleanupE2e } from "../../prisma/seed-e2e.mjs";

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === "1") return;
  const prisma = new PrismaClient();
  try {
    await cleanupE2e(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
