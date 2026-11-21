import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import bn from "../../messages/bn.json" with { type: "json" };
import en from "../../messages/en.json" with { type: "json" };
import { expect, test } from "./support/fixtures";

const BANGLA_SCRIPT = /[ঀ-৿]/;
const BANGLA_DIGIT = /[০-৯]/;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
}

// Serious and critical WCAG A/AA violations fail, as in accessibility.spec.ts.
async function audit(page: Page, name: string) {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`axe-${name}`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
  const blocking = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(blocking, `${name} has serious accessibility violations`).toEqual([]);
}

async function switchTo(page: Page, locale: "en" | "bn") {
  await page.locator(`.language-switcher button[lang="${locale}"]`).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await settle(page);
}

test("public pages switch to Bangla, keep it after reload, and switch back", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const heading = page.locator('h1[data-hero="title"]');
  // textContent, like toHaveText below; innerText adds line breaks that depend on layout.
  const englishHeading = ((await heading.textContent()) ?? "").trim();
  expect(englishHeading).not.toMatch(BANGLA_SCRIPT);

  await switchTo(page, "bn");
  await expect(heading).toHaveText(BANGLA_SCRIPT);
  await expect(page.getByRole("link", { name: bn.shell.skipToContent })).toBeAttached();
  await expect(page.locator("main")).toContainText(BANGLA_DIGIT);
  await audit(page, "home-bn");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(heading).toHaveText(BANGLA_SCRIPT);

  await page.goto("/track");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(BANGLA_SCRIPT);
  await audit(page, "track-bn");

  await page.goto("/");
  await switchTo(page, "en");
  await expect(heading).toHaveText(englishHeading);
  await expect(page.getByRole("link", { name: en.shell.skipToContent })).toBeAttached();
  await audit(page, "home-en");
});

test("the admin dashboard switches to Bangla with Bangla figures and switches back", async ({ signedInPage }) => {
  const page = await signedInPage("ADMIN");
  await page.goto("/admin");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText(en.admin.dashboard.operationsOverview);

  await switchTo(page, "bn");
  await expect(title).toHaveText(bn.admin.dashboard.operationsOverview);
  // Count-ups finish on the exact localized text.
  const figures = page.locator("[data-count-up]");
  await expect(figures.first()).toHaveText(/^[০-৯]+%?$/);
  await expect(page.getByText(bn.admin.dashboard.totalShipments)).toBeVisible();
  await audit(page, "admin-bn");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(title).toHaveText(bn.admin.dashboard.operationsOverview);

  await switchTo(page, "en");
  await expect(title).toHaveText(en.admin.dashboard.operationsOverview);
  await expect(figures.first()).toHaveText(/^[0-9]+%?$/);
  await audit(page, "admin-en");
});
