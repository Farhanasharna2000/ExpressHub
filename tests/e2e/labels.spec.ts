import { E2E_USERS } from "../../prisma/seed-e2e.mjs";
import { expect, test } from "./support/fixtures";

test("a customer prints a shipping label and gets a PDF in a new tab", async ({ signedInPage, paidShipment }) => {
  const shipment = await paidShipment();
  const customer = await signedInPage("CUSTOMER");
  await customer.goto(`/customer/shipments/${shipment.id}`);

  const label = customer.waitForResponse((response) => response.url().endsWith(`/api/v1/shipments/${shipment.id}/label?lang=en`));
  const tab = customer.context().waitForEvent("page");
  await customer.getByRole("button", { name: `Print shipping label for ${shipment.trackingNumber}` }).click();

  const response = await label;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  // The label opens in a new tab from a blob URL, because the API needs the in-memory
  // session token. Headless Chromium has no PDF viewer, so there it arrives as a download.
  const opened = await tab;
  const download = await opened.waitForEvent("download", { timeout: 15_000 });
  expect(download.url()).toMatch(/^blob:/);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

test("a courier types a tracking number and lands on their delivery; others are refused", async ({ signedInPage, paidShipment, db }) => {
  const mine = await paidShipment();
  const notMine = await paidShipment();
  const courierUser = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS.COURIER.email } });
  await db.shipment.update({ where: { id: mine.id }, data: { courierId: courierUser.id } });

  const courier = await signedInPage("COURIER");
  await courier.goto("/courier/scan");
  await expect(courier.getByRole("heading", { name: "Scan parcel" })).toBeVisible();

  const field = courier.getByLabel("Tracking number");
  await field.fill(notMine.trackingNumber);
  await courier.getByRole("button", { name: "Open delivery" }).click();
  await expect(courier.getByRole("status").filter({ hasText: "isn't assigned to you" })).toBeVisible();

  // A pasted tracking link works as well as the bare number.
  await field.fill(`https://expresshub.example/track/${mine.trackingNumber.toLowerCase()}`);
  await courier.getByRole("button", { name: "Open delivery" }).click();
  await expect(courier).toHaveURL(new RegExp(`/courier/shipments/${mine.id}$`));
});
