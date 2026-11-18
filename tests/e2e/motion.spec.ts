import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

const METRICS = ["99.98%", "<250ms", "100%", "29+"];

async function motionPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, reducedMotion: "no-preference" });
  return { page: await context.newPage(), close: () => context.close() };
}

async function expectHomeSettled(page: Page) {
  const lines = page.locator("[data-hero=title] .hero-line");
  await expect(lines).toHaveCount(3);
  for (const line of await lines.all()) await expect(line).toHaveCSS("opacity", "1");
  await expect(page.locator(".journey-route-parcel-group")).toHaveAttribute("transform", "translate(396 34)");
  await page.locator(".metrics-grid").scrollIntoViewIfNeeded();
  await expect(page.locator(".metric-val")).toHaveText(METRICS);
  for (const card of await page.locator("[data-reveal=role]").all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveCSS("opacity", "1");
  }
}

test("with reduced motion the home page renders in its final state straight away", async ({ page }) => {
  await page.goto("/");
  // No animation runs, so nothing is ever transparent or mid-count.
  await expect(page.locator(".metric-val")).toHaveText(METRICS, { timeout: 2_000 });
  await expect(page.locator("[data-hero=title] .hero-line").first()).toHaveCSS("opacity", "1", { timeout: 2_000 });
  await expectHomeSettled(page);
});

test("with motion the home page animations settle on the same final content", async ({ browser, baseURL }) => {
  const { page, close } = await motionPage(browser, baseURL);
  await page.goto("/");
  await expectHomeSettled(page);
  await close();
});

for (const reducedMotion of [true, false]) {
  test(`public tracking shows the full timeline ${reducedMotion ? "with reduced motion" : "after its animation"}`, async ({ browser, baseURL, page: reducedPage, paidShipment }) => {
    const shipment = await paidShipment();
    const opened = reducedMotion ? null : await motionPage(browser, baseURL);
    const page = opened?.page ?? reducedPage;
    await page.goto(`/track/${shipment.trackingNumber}`);
    await expect(page.getByRole("heading", { name: "Track your parcel" })).toBeVisible();
    for (const step of await page.locator("[data-anim=step]").all()) await expect(step).toHaveCSS("opacity", "1");
    for (const entry of await page.locator(".shipment-timeline > li").all()) await expect(entry).toHaveCSS("opacity", "1");
    await expect(page.locator(".tracking-progress-fill")).toBeAttached();
    await opened?.close();
  });
}
