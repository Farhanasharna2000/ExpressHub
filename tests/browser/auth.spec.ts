import { setMockPageSession } from "./session";
import { expect, test, type Page } from "@playwright/test";

async function mockAuth(page: Page, role = "CUSTOMER", restored = false) {
  let signedIn = restored;
  if (restored) await setMockPageSession(page, role);
  let current = { id: "user-1", name: "Alex Sender", email: "alex@example.com", phone: null as string | null, role, isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  const calls: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON(); calls.push({ path, body });
    const response = (data: unknown, status = 200) => route.fulfill({ status, json: status === 200 ? { success: true, message: "OK", data } : { success: false, message: "Invalid email or password", errors: [] } });
    if (path.endsWith("/auth/refresh-token")) return signedIn ? response({ accessToken: "test-access-token" }) : response(null, 401);
    if (path.endsWith("/auth/login") || path.endsWith("/auth/register")) { signedIn = true; await setMockPageSession(page, role); return response({ accessToken: "test-access-token", user: current }); }
    if (path.endsWith("/auth/logout")) { signedIn = false; await page.context().clearCookies({ name: "expresshub_page_session" }); return response(null); }
    if (path.endsWith("/users/me")) {
      if (!signedIn) return response(null, 401);
      expect(route.request().headers().authorization).toBe("Bearer test-access-token");
      if (route.request().method() === "PATCH") current = { ...current, ...body };
      return response({ user: current });
    }
    return response(null, 404);
  });
  return calls;
}

test("login, profile update, reload restoration, and logout", async ({ page }) => {
  await mockAuth(page);
  await page.goto("/customer");
  await expect(page.getByRole("heading", { name: "Sign in to ExpressHub" })).toBeVisible();
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secure-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/customer$/);
  await page.goto("/profile");
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Sender");
  await page.getByLabel("Full name").fill("Alex Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Full name")).toHaveValue("Alex Updated");
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain("test-access-token");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to ExpressHub" })).toBeVisible();
  await page.goto("/profile"); await expect(page).toHaveURL(/\/login\?next=/);
});

test("registration validates UTF-8 password length and sends only customer fields", async ({ page }) => {
  const calls = await mockAuth(page); await page.goto("/register");
  await page.getByLabel("Full name").fill("New Customer"); await page.getByLabel("Email address").fill("new@example.com");
  await page.getByLabel("Password", { exact: true }).fill("😀".repeat(19));
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Password must be no more than 72 UTF-8 bytes")).toBeVisible();
  expect(calls.filter(c => c.path.endsWith("register"))).toHaveLength(0);
  await page.getByLabel("Password", { exact: true }).fill("secure-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/customer$/);
  expect(calls.find(c => c.path.endsWith("register"))?.body).toEqual({ name: "New Customer", email: "new@example.com", password: "secure-password-123" });
});

for (const role of ["CUSTOMER", "COURIER", "ADMIN"]) {
  test(`${role} lands in its own workspace and cannot view another role`, async ({ page }) => {
    await mockAuth(page, role, true); await page.goto("/login?next=https://evil.example");
    await expect(page).toHaveURL(new RegExp(`/${role.toLowerCase()}$`));
    await page.goto(role === "ADMIN" ? "/customer" : "/admin");
    await expect(page).toHaveURL(new RegExp(`/${role.toLowerCase()}$`));
    await expect(page.getByRole("heading", { name: role === "ADMIN" ? "Your deliveries, together" : "Operations overview" })).toHaveCount(0);
  });
}

test("invalid credentials are announced, no retry loop, and form remains usable", async ({ page }) => {
  const calls = await mockAuth(page); await page.route("**/api/v1/auth/login", route => route.fulfill({ status: 401, json: { success: false, message: "Invalid email or password", errors: [] } }));
  await page.goto("/login"); await page.getByLabel("Email address").fill("alex@example.com"); await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-form-error]")).toContainText("Invalid email or password");
  expect(calls.filter(c => c.path.endsWith("refresh-token"))).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("shadcn form fits the viewport and password control works", async ({ page }) => {
  await mockAuth(page); await page.goto("/register");
  await page.getByLabel("Password", { exact: true }).fill("some-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('[data-slot="card"]')).toBeVisible();
  await page.screenshot({ path: `test-results/register-${test.info().project.name}.png`, fullPage: true });
});

test("rate limits disable retry until Retry-After elapses", async ({ page }) => {
  await mockAuth(page);
  await page.route("**/api/v1/auth/login", route => route.fulfill({ status: 429, headers: { "Retry-After": "2" }, json: { success: false, message: "Too many requests", errors: [] } }));
  await page.goto("/login"); await page.getByLabel("Email address").fill("alex@example.com"); await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  await expect(page.locator("[data-form-error]")).toContainText("Too many requests");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled({ timeout: 5000 });
});

test("failed logout removes private content and offers revocation retry", async ({ page }) => {
  await mockAuth(page, "CUSTOMER", true); await page.goto("/profile");
  await page.route("**/api/v1/auth/logout", route => route.fulfill({ status: 503, json: { success: false, message: "Unavailable", errors: [] } }));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Sign-out was not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry sign-out" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
});

test("workspace navigation works at both widths with a keyboard skip link", async ({ page }, testInfo) => {
  await mockAuth(page, "CUSTOMER", true); await page.goto("/customer");
  await expect(page.getByRole("heading", { name: "Your deliveries, together" })).toBeVisible();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/payments$/);
  await expect(page.getByRole("heading", { name: "My payments" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("server field errors remain editable and focus the affected input", async ({ page }) => {
  await mockAuth(page);
  await page.route("**/api/v1/auth/register", route => route.fulfill({ status: 400, json: { success: false, message: "Validation failed", errors: [{ path: "email", message: "Email is already registered" }] } }));
  await page.goto("/register");
  await page.getByLabel("Full name").fill("New Customer");
  await page.getByLabel("Email address").fill("taken@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secure-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Email is already registered")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await page.getByLabel("Email address").fill("available@example.com");
  await expect(page.getByText("Email is already registered")).toHaveCount(0);
});
