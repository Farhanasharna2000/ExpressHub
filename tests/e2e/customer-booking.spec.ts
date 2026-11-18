import { randomUUID } from "node:crypto";
import { E2E_DOMAIN, E2E_PASSWORD, E2E_WEIGHT_KG } from "../../prisma/seed-e2e.mjs";
import { BookingPage, RegisterPage } from "./pages/customer";
import { expect, test } from "./support/fixtures";

test("a new customer registers, books a shipment and is sent to Stripe Checkout", async ({ page, db }) => {
  const email = `e2e-cust-${randomUUID().slice(0, 8)}@${E2E_DOMAIN}`;
  await new RegisterPage(page).register({ name: "E2E New Customer", email, password: E2E_PASSWORD });

  const shipment = await new BookingPage(page).book({ weightKg: Number(E2E_WEIGHT_KG).toString() });
  const stored = await db.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { customer: true } });
  expect(stored.customer.email).toBe(email);
  expect(stored.status).toBe("CREATED");
  await expect(page.getByText(`BDT ${stored.price.toFixed(2)}`, { exact: true }).first()).toBeVisible();

  // The suite never contacts Stripe: the initiation call and the hosted page are stubbed in the browser.
  const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_e2e";
  let initiation: { body: unknown; idempotencyKey: string | undefined } | undefined;
  await page.route("**/api/v1/payments/initiate", async (route) => {
    initiation = { body: route.request().postDataJSON(), idempotencyKey: route.request().headers()["idempotency-key"] };
    await route.fulfill({
      json: { success: true, message: "Checkout created", data: { payment: { id: "e2e-payment", status: "PENDING" }, checkoutUrl } },
    });
  });
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Stripe Checkout (test stub)</title><h1>Stripe Checkout</h1>" }));

  await page.getByRole("button", { name: "Pay with Stripe" }).click();
  await expect(page).toHaveURL(checkoutUrl);
  expect(initiation?.body).toEqual({ shipmentId: shipment.id });
  expect(initiation?.idempotencyKey).toBeTruthy();

  await page.goto("/customer/shipments");
  await expect(page.getByText(shipment.trackingNumber).first()).toBeVisible();
});
