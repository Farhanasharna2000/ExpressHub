import type { Page } from "@playwright/test";
import jwt from "jsonwebtoken";

// Only used by the isolated Playwright server and API mocks.
export const browserTestSecret = "expresshub-playwright-only-secret-at-least-32-bytes";
export async function setMockPageSession(page: Page, role: string) {
  const value = jwt.sign({ role, tokenType: "page" }, browserTestSecret, {
    algorithm: "HS256", subject: "mock-user", issuer: "expresshub",
    audience: "expresshub-pages", expiresIn: "1h",
  });
  await page.context().addCookies([{ name: "expresshub_page_session", value,
    domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
}
