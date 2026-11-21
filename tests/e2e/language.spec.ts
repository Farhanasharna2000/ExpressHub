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

// The headline reveal rebuilds the h1's markup. These tests run with motion on and wait for
// the reveal to finish, which is when React's text updates used to land on detached nodes.
const headlineLines = (messages: typeof en, signedIn: boolean) =>
  signedIn
    ? `${messages.home.signedInLine1}${messages.home.signedInLine2}${messages.home.signedInLine3}`
    : `${messages.home.line1}${messages.home.line2}${messages.home.line3}`;

async function revealFinished(page: Page) {
  await page.waitForFunction(() => {
    const title = document.querySelector('h1[data-hero="title"]');
    return Boolean(title) && title!.querySelectorAll(".hero-line > div").length === 0;
  }, undefined, { timeout: 20_000 });
}

test("the signed-in headline matches the sign-in state and follows the language at once", async ({ signedInPage }) => {
  const page = await signedInPage("CUSTOMER", { reducedMotion: "no-preference" });
  const heading = page.locator('h1[data-hero="title"]');
  await page.goto("/");
  // The page first renders signed out, then switches once the session is restored.
  await expect(heading).toHaveText(headlineLines(en, true));
  await revealFinished(page);

  await page.locator('.language-switcher button[lang="bn"]').first().click();
  await expect(heading).toHaveText(headlineLines(bn, true), { timeout: 2_000 });
  await page.locator('.language-switcher button[lang="en"]').first().click();
  await expect(heading).toHaveText(headlineLines(en, true), { timeout: 2_000 });
});

test("the signed-out headline follows the language at once after its reveal", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const heading = page.locator('h1[data-hero="title"]');
  await page.goto("/");
  await expect(heading).toHaveText(headlineLines(en, false));
  await revealFinished(page);

  await page.locator('.language-switcher button[lang="bn"]').first().click();
  await expect(heading).toHaveText(headlineLines(bn, false), { timeout: 2_000 });
  // Switching language does not replay the letter reveal.
  expect(await heading.locator(".hero-line > div").count()).toBe(0);
  await context.close();
});

for (const width of [1415, 820, 390]) {
  test(`every Bangla headline line stays on one row at ${width}px`, async ({ browser, baseURL, signedInPage }) => {
    const host = new URL(baseURL!).hostname;
    const viewport = { width, height: 900 };
    const signedOut = await browser.newContext({ baseURL, viewport, reducedMotion: "reduce" });
    const pages = [await signedOut.newPage(), await signedInPage("CUSTOMER", { viewport, reducedMotion: "reduce" })];
    for (const [index, page] of pages.entries()) {
      await page.context().addCookies([{ name: "locale", value: "bn", domain: host, path: "/" }]);
      await page.goto("/");
      const expected = headlineLines(bn, index === 1);
      await expect(page.locator('h1[data-hero="title"]')).toHaveText(expected);
      // The page streams in: measure only once the headline is on screen and the font is loaded.
      await expect(page.locator('h1[data-hero="title"]')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const rows = await page.locator('h1[data-hero="title"]').evaluate((h1) => {
        const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
        return [...h1.querySelectorAll(".hero-line")].map((line) => Math.round(line.getBoundingClientRect().height / lineHeight));
      });
      expect(rows, `${index === 1 ? "signed in" : "signed out"} at ${width}px`).toEqual([1, 1, 1]);
    }
    await signedOut.close();
  });
}
