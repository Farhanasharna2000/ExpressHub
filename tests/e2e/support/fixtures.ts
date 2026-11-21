import { createHash, randomBytes } from "node:crypto";
import { test as base, expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { E2E_USERS, createPaidShipment } from "../../../prisma/seed-e2e.mjs";

type Role = keyof typeof E2E_USERS;

const prisma = new PrismaClient();

// Each test gets its own refresh token row instead of replaying a saved login.
// Refresh tokens rotate on use and reuse revokes every session, so a shared
// storage state would sign the other tests out. This also keeps the suite clear
// of the login rate limits. Login itself is covered by the registration journey.
async function sessionCookies(baseURL: string, userId: string, role: UserRole) {
  const refreshToken = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET must be set for the e2e suite");
  const pageSession = jwt.sign({ role, tokenType: "page" }, secret, {
    algorithm: "HS256", subject: userId, issuer: "expresshub", audience: "expresshub-pages", expiresIn: "1h",
  });
  const { hostname } = new URL(baseURL);
  return [
    { name: "expresshub_refresh", value: refreshToken, domain: hostname, path: "/api/v1/auth", httpOnly: true, sameSite: "Lax" as const },
    { name: "expresshub_page_session", value: pageSession, domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" as const },
  ];
}

async function seededUser(role: Role) {
  return prisma.user.findUniqueOrThrow({ where: { email: E2E_USERS[role].email } });
}

type Fixtures = {
  // Opens a separate signed-in browser context for a seeded role.
  signedInPage: (role: Role, options?: BrowserContextOptions) => Promise<Page>;
  db: PrismaClient;
  seededUser: typeof seededUser;
  paidShipment: () => Promise<{ id: string; trackingNumber: string }>;
};

export const test = base.extend<Fixtures>({
  signedInPage: async ({ browser, baseURL }, provide) => {
    const contexts: Awaited<ReturnType<Browser["newContext"]>>[] = [];
    await provide(async (role, options = {}) => {
      const user = await seededUser(role);
      // Reduced motion, like the default context: axe must scan settled pages, not fade-ins.
      const context = await browser.newContext({ baseURL, reducedMotion: "reduce", ...options });
      contexts.push(context);
      await context.addCookies(await sessionCookies(baseURL!, user.id, user.role));
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  db: async ({}, provide) => provide(prisma),
  seededUser: async ({}, provide) => provide(seededUser),
  paidShipment: async ({}, provide) => {
    await provide(async () => {
      const customer = await seededUser("CUSTOMER");
      return createPaidShipment(prisma, customer.id);
    });
  },
});

export { expect };
