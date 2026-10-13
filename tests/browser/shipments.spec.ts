import { setMockPageSession } from "./session";
import { expect, test, type Page, type Route } from "@playwright/test";

const id = "cm123456789012345678901234";
const fixture = {
  id, trackingNumber: "EH-TEST123", customerId: "owner", courierId: null,
  pickupContactName: "Sender Name", pickupContactPhone: "01700000000", pickupAddress: "12 Pickup Street, Dhaka",
  deliveryContactName: "Recipient Name", deliveryContactPhone: "01800000000", deliveryAddress: "34 Delivery Street, Dhaka",
  parcelWeightKg: "1.125", parcelLengthCm: null, parcelWidthCm: null, parcelHeightCm: null,
  packageDescription: null, pickupScheduledAt: null, deliveredAt: null,
  price: "127.35", currency: "BDT", status: "CREATED", paymentStatus: "PENDING",
  createdAt: "2026-01-01T08:00:00Z", updatedAt: "2026-01-01T08:00:00Z",
  events: [{ id: "event-2", type: "COURIER_ASSIGNED", fromStatus: "CREATED", toStatus: "CREATED", publicNote: "Courier assigned", internalNote: "PRIVATE NOTE", occurredAt: "2026-01-02T08:00:00Z" }, { id: "event-1", type: "CREATED", fromStatus: null, toStatus: "CREATED", publicNote: null, occurredAt: "2026-01-01T08:00:00Z" }],
};
const ok = (route: Route, data: unknown) => route.fulfill({ json: { success: true, message: "OK", data } });
const failure = (route: Route, status: number, message: string) => route.fulfill({ status, json: { success: false, message, errors: [] } });
async function setup(page: Page) {
  await setMockPageSession(page, "CUSTOMER");
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = [];
  let shipment = { ...fixture };
  await page.route("**/api/v1/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    calls.push({ url, method: request.method(), body: request.postDataJSON() });
    if (url.pathname.endsWith("refresh-token")) return ok(route, { accessToken: "token" });
    if (url.pathname.endsWith("users/me")) return ok(route, { user: { id: "owner", name: "Sender Name", email: "sender@example.com", phone: null, role: "CUSTOMER", isActive: true } });
    expect(request.headers().authorization).toBe("Bearer token");
    if (url.pathname.endsWith("/status")) { shipment = { ...shipment, status: "CANCELLED" }; return ok(route, { shipment }); }
    if (url.pathname.endsWith(`/shipments/${id}`)) return ok(route, { shipment });
    if (url.pathname.endsWith("/shipments") && request.method() === "POST") return ok(route, { shipment });
    if (url.pathname.endsWith("/shipments")) {
      const q = url.searchParams.get("q");
      const rows = q && q !== "Dhaka" ? [] : [shipment];
      return ok(route, { shipments: rows, pagination: { page: Number(url.searchParams.get("page") || 1), limit: Number(url.searchParams.get("limit") || 20), total: rows.length ? 24 : 0, totalPages: rows.length ? 2 : 0 } });
    }
    return failure(route, 404, "Not found");
  });
  return calls;
}
async function fillBooking(page: Page) {
  await page.goto("/customer/shipments/new");
  await page.getByLabel("Pickup contact name").fill(fixture.pickupContactName);
  await page.getByLabel("Pickup phone").fill(fixture.pickupContactPhone);
  await page.getByLabel("Pickup address", { exact: true }).fill(fixture.pickupAddress);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Recipient name").fill(fixture.deliveryContactName);
  await page.getByLabel("Recipient phone").fill(fixture.deliveryContactPhone);
  await page.getByLabel("Delivery address", { exact: true }).fill(fixture.deliveryAddress);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Weight (kg)").fill("1.125");
}

test("books through review, sends allowed fields once, and shows the server price", async ({ page }) => {
  const calls = await setup(page); await fillBooking(page);
  await page.getByLabel("Preferred pickup time (optional)").fill("2099-03-15T14:30");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review your shipment" })).toBeVisible();
  await expect(page.getByText("BDT 127.35")).toHaveCount(0);
  await page.getByRole("button", { name: "Create shipment", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/shipments/${id}$`));
  await expect(page.getByText("BDT 127.35")).toBeVisible();
  const creations = calls.filter(call => call.method === "POST" && call.url.pathname.endsWith("/shipments"));
  expect(creations).toHaveLength(1);
  expect(creations[0].body).toEqual({ pickupContactName: fixture.pickupContactName, pickupContactPhone: fixture.pickupContactPhone, pickupAddress: fixture.pickupAddress, deliveryContactName: fixture.deliveryContactName, deliveryContactPhone: fixture.deliveryContactPhone, deliveryAddress: fixture.deliveryAddress, parcelWeightKg: 1.125, pickupScheduledAt: await page.evaluate(() => new Date("2099-03-15T14:30").toISOString()) });
  const titles = page.locator(".shipment-timeline h3"); await expect(titles).toHaveText(["Created", "Courier assigned"]);
  await expect(page.getByText("PRIVATE NOTE")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/shipment-detail-${test.info().project.name}.png`, fullPage: true });
});

test("weight precision and past pickup times prevent submission", async ({ page }) => {
  const calls = await setup(page); await fillBooking(page);
  await page.getByLabel("Weight (kg)").fill("1.0001");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Weight (kg)")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Weight (kg)").fill("1.125");
  await expect(page.getByLabel("Length (cm)")).toHaveCount(0);
  await expect(page.getByLabel("Width (cm)")).toHaveCount(0);
  await expect(page.getByLabel("Height (cm)")).toHaveCount(0);
  await page.getByLabel("Preferred pickup time (optional)").fill("2000-01-01T10:00");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Pickup must be scheduled in the future")).toBeVisible();
  expect(calls.filter(call => call.method === "POST" && call.url.pathname.endsWith("/shipments"))).toHaveLength(0);
});

test("ambiguous create failure directs to the list and prevents a duplicate retry", async ({ page }) => {
  await setup(page); let creations = 0;
  await page.route("**/api/v1/shipments", route => { if (route.request().method() === "POST") { creations++; return route.abort("failed"); } return route.fallback(); });
  await fillBooking(page); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Create shipment", exact: true }).click();
  await expect(page.getByText("Check your shipments before booking again", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create shipment", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Check my shipments" }).click();
  await expect(page).toHaveURL(/\/customer\/shipments$/); expect(creations).toBe(1);
});

test("filters and pagination round-trip through the URL and reset page on search", async ({ page }) => {
  const calls = await setup(page); await page.goto("/customer/shipments?page=2&limit=5");
  await expect(page.getByText("Page 2 of 2 · 24 results")).toBeVisible();
  await page.getByLabel("Search shipments").fill("Dhaka");
  await expect(page).toHaveURL(/page=1.*q=Dhaka/);
  await page.getByLabel("Shipment status", { exact: true }).selectOption("CREATED");
  await page.getByLabel("Payment status", { exact: true }).selectOption("PENDING");
  await page.getByLabel("Sort by").selectOption("price");
  await page.getByLabel("Order", { exact: true }).selectOption("asc");
  await expect(page.getByRole("link", { name: fixture.trackingNumber }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 2 · 24 results")).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Search shipments")).toHaveValue("Dhaka");
  expect(calls.some(call => call.url.searchParams.get("sortBy") === "price" && call.url.searchParams.get("order") === "asc" && call.url.searchParams.get("status") === "CREATED")).toBe(true);
  await page.getByLabel("Search shipments").fill("Missing");
  await expect(page.getByRole("heading", { name: "No matching shipments" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("bad URL filters show a recovery action without fetching an invalid list", async ({ page }) => {
  const calls = await setup(page); await page.goto("/customer/shipments?page=0&status=WRONG");
  await expect(page.getByText("Check the list filters", { exact: true })).toBeVisible();
  expect(calls.filter(call => call.url.pathname.endsWith("/shipments"))).toHaveLength(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/customer\/shipments$/);
});

test("cancellation uses expected status and shows only a server-confirmed result", async ({ page }) => {
  const calls = await setup(page); await page.goto(`/customer/shipments/${id}`);
  await page.getByRole("button", { name: "Cancel shipment", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("does not automatically refund");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText("Shipment cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel shipment", exact: true })).toHaveCount(0);
  expect(calls.find(call => call.method === "PATCH")?.body).toEqual({ status: "CANCELLED", expectedStatus: "CREATED" });
  expect(calls.filter(call => call.url.pathname.endsWith(`/shipments/${id}`)).length).toBeGreaterThan(1);
});

test("cancellation conflicts explain pending Checkout and reload details", async ({ page }) => {
  const calls = await setup(page);
  await page.route("**/api/v1/shipments/*/status", route => failure(route, 409, "Resolve or expire the pending Stripe checkout before cancelling the shipment"));
  await page.goto(`/customer/shipments/${id}`); await page.getByRole("button", { name: "Cancel shipment", exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText(/Resolve or expire the pending Stripe checkout/)).toBeVisible();
  await expect(page.getByText("Shipment cancelled", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel shipment", exact: true })).toBeVisible();
  expect(calls.filter(call => call.url.pathname.endsWith(`/shipments/${id}`)).length).toBeGreaterThan(1);
});

test("unavailable shipment never renders private details or cancellation controls", async ({ page }) => {
  await setup(page); await page.route(`**/api/v1/shipments/${id}`, route => failure(route, 404, "Shipment not found"));
  await page.goto(`/customer/shipments/${id}`);
  await expect(page.getByText("Shipment unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.pickupAddress)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel shipment", exact: true })).toHaveCount(0);
});

test("booking focuses invalid fields and retains values when returning to a step", async ({ page }) => {
  const calls = await setup(page);
  await page.goto("/customer/shipments/new");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Pickup contact name")).toBeFocused();
  await expect(page.getByLabel("Pickup contact name")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Pickup contact name").fill(fixture.pickupContactName);
  await page.getByLabel("Pickup phone").fill(fixture.pickupContactPhone);
  await page.getByLabel("Pickup address").fill(fixture.pickupAddress);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Recipient name")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Pickup contact name")).toHaveValue(fixture.pickupContactName);
  await expect(page.getByLabel("Pickup phone")).toHaveValue(fixture.pickupContactPhone);
  expect(calls.filter(call => call.method === "POST" && call.url.pathname.endsWith("/shipments"))).toHaveLength(0);
});
