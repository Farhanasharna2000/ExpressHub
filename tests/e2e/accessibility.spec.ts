import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

// Serious and critical WCAG 2.x A/AA violations fail the build; minor and moderate
// ones are attached to the report for follow-up.
async function audit(page: Page, name: string) {
  // Scan the settled page: loading states and transitions are checked half-drawn otherwise,
  // which hides real contrast failures behind partial opacity or reports transient ones.
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`axe-${name}`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
  const blocking = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(blocking, `${name} has serious accessibility violations`).toEqual([]);
}

const publicPages = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "track-search", path: "/track" },
  { name: "help", path: "/help" },
];

for (const { name, path } of publicPages) {
  test(`${name} page has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await audit(page, name);
  });
}

test("customer booking form has no serious accessibility violations", async ({ signedInPage }) => {
  const page = await signedInPage("CUSTOMER");
  await page.goto("/customer/shipments/new");
  await expect(page.getByLabel("Pickup contact name")).toBeVisible();
  await audit(page, "booking");
});

test("admin dashboard has no serious accessibility violations", async ({ signedInPage }) => {
  const page = await signedInPage("ADMIN");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await audit(page, "admin-dashboard");
});

test("courier workspace has no serious accessibility violations", async ({ signedInPage }) => {
  const page = await signedInPage("COURIER");
  await page.goto("/courier");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await audit(page, "courier");
});
