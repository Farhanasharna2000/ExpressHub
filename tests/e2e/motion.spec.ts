import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

const METRICS = ["99.98%", "<250ms", "100%", "29+"];
const HEADLINE = /Big plans\.\s*Small parcels\.\s*All connected\./;

async function motionPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, reducedMotion: "no-preference" });
  return { page: await context.newPage(), close: () => context.close() };
}

async function expectHomeSettled(page: Page) {
  const lines = page.locator("[data-hero=title] .hero-line");
  await expect(lines).toHaveCount(3);
  for (const line of await lines.all()) await expect(line).toHaveCSS("opacity", "1");
  await expect(page.locator(".journey-route-parcel-group")).toHaveAttribute("transform", "translate(396 34)");
  await expect(page.locator(".journey-route-chip")).toHaveCSS("opacity", "1");
  // The split headline is reverted after the intro: no leftover masks or hidden characters.
  await expect(page.locator("[data-hero=title] [aria-hidden=true]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(HEADLINE);
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
  // While the headline is split into characters, assistive tech still gets the whole sentence.
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(HEADLINE);
  await expectHomeSettled(page);
  await close();
});

test("the track form works while the hero intro is still playing", async ({ browser, baseURL }) => {
  const { page, close } = await motionPage(browser, baseURL);
  await page.goto("/");
  // No waiting for the intro: decorative layers never block the form.
  const trackingNumber = "EH-0123456789ABCDEF01234567";
  await page.getByLabel("Tracking number").first().fill(trackingNumber);
  await page.getByRole("button", { name: "Track" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/track/${trackingNumber}$`));
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

test("a delivered parcel parks the truck at the end, celebrates once and cleans up", async ({ browser, baseURL, paidShipment, db }) => {
  const shipment = await paidShipment();
  await db.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED" } });
  const { page, close } = await motionPage(browser, baseURL);
  await page.goto(`/track/${shipment.trackingNumber}`);
  await expect(page.getByRole("heading", { name: "Delivered" }).first()).toBeVisible();
  // The truck sits on the last step once its ride finishes (10% + 80% of the steps row).
  const truck = page.locator("[data-anim=truck]");
  await expect(truck).toBeVisible();
  await expect.poll(() => truck.evaluate((element) => element.style.left)).toBe("90%");
  // Confetti appears, then every piece removes itself.
  await expect(page.locator("[data-confetti]").first()).toBeAttached({ timeout: 5_000 });
  await expect(page.locator("[data-confetti]")).toHaveCount(0, { timeout: 8_000 });
  // Opening the same parcel again in this tab does not throw more confetti.
  await page.reload();
  await expect(truck).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(page.locator("[data-confetti]")).toHaveCount(0);
  await close();
});

test("with reduced motion the truck is in place and there is no confetti", async ({ page, paidShipment, db }) => {
  const shipment = await paidShipment();
  await db.shipment.update({ where: { id: shipment.id }, data: { status: "DELIVERED" } });
  await page.goto(`/track/${shipment.trackingNumber}`);
  await expect(page.locator("[data-anim=truck]")).toBeVisible();
  await expect(page.locator("[data-anim=truck]")).toHaveCSS("left", /px$/);
  await page.waitForTimeout(2_000);
  await expect(page.locator("[data-confetti]")).toHaveCount(0);
});
