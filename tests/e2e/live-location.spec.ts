import type { Page } from "@playwright/test";
import { E2E_USERS } from "../../prisma/seed-e2e.mjs";
import { expect, test } from "./support/fixtures";

// A 1x1 transparent PNG: tile requests are answered locally, so the suite never loads
// real OpenStreetMap tiles (their usage policy forbids automated bulk requests).
const BLANK_TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const stubTiles = (page: Page) => page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: BLANK_TILE }));

// Gulshan, Dhaka; rounds to 23.781, 90.416 in public.
const POSITION = { latitude: 23.780573, longitude: 90.415862, accuracy: 10 };

test("a courier shares a live location and the public tracking page shows it on a map", async ({ signedInPage, paidShipment, db, browser, baseURL }) => {
  const shipment = await paidShipment();
  const courierUser = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS.COURIER.email } });
  await db.shipment.update({ where: { id: shipment.id }, data: { courierId: courierUser.id, status: "OUT_FOR_DELIVERY" } });

  const courier = await signedInPage("COURIER", { permissions: ["geolocation"], geolocation: POSITION });
  await stubTiles(courier);
  await courier.goto(`/courier/shipments/${shipment.id}`);
  const toggle = courier.getByTestId("live-location-toggle");
  await expect(toggle).toBeVisible();
  await toggle.getByRole("button", { name: "Share my live location" }).click();
  await expect(courier.getByRole("status").filter({ hasText: "Sharing live location" })).toBeVisible();
  await expect.poll(async () => (await db.courierLocation.findUnique({ where: { courierId: courierUser.id } }))?.latitude).toBe(POSITION.latitude);

  // Anyone with the tracking link sees an approximate position, with a text summary beside the map.
  const visitorContext = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  const visitor = await visitorContext.newPage();
  await stubTiles(visitor);
  await visitor.goto(`/track/${shipment.trackingNumber}`);
  const card = visitor.getByTestId("courier-location");
  await expect(card).toBeVisible();
  await expect(card.getByRole("status")).toContainText("approximate position was updated");
  await expect(card.getByRole("region", { name: "Map of the courier's approximate position" })).toBeVisible();
  await expect(card.locator(".courier-marker")).toBeVisible();
  // Only rounded coordinates reach the page.
  expect(await visitor.content()).not.toContain(String(POSITION.latitude));

  // Stopping removes the stored position, and the public card disappears on the next update.
  await courier.getByRole("button", { name: "Stop sharing" }).first().click();
  await expect.poll(() => db.courierLocation.count({ where: { courierId: courierUser.id } })).toBe(0);
  await visitor.reload();
  await expect(visitor.getByTestId("courier-location")).toHaveCount(0);
  await visitorContext.close();
});
