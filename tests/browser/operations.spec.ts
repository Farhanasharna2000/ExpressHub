import { expect, test, type Page, type Route } from "@playwright/test";

const shipmentId = "cm111222333444555666777888";
const fixture = {
  id: shipmentId,
  trackingNumber: "EH-OPS-789",
  customerId: "cust-1",
  courierId: "courier-1",
  pickupContactName: "Sender Operations",
  pickupContactPhone: "01700000000",
  pickupAddress: "100 Industrial Zone, Dhaka",
  deliveryContactName: "Recipient Retail",
  deliveryContactPhone: "01800000000",
  deliveryAddress: "200 Commercial Market, Dhaka",
  parcelWeightKg: "3.500",
  parcelLengthCm: null,
  parcelWidthCm: null,
  parcelHeightCm: null,
  packageDescription: "Commercial retail goods",
  pickupScheduledAt: null as string | null,
  deliveredAt: null as string | null,
  price: "250.00",
  currency: "BDT",
  status: "CREATED",
  paymentStatus: "PAID",
  createdAt: "2026-01-01T08:00:00Z",
  updatedAt: "2026-01-01T08:00:00Z",
  events: [
    {
      id: "ev-1",
      type: "CREATED",
      fromStatus: null,
      toStatus: "CREATED",
      publicNote: "Shipment registered",
      occurredAt: "2026-01-01T08:00:00Z",
    },
  ],
};

const ok = (route: Route, data: unknown) =>
  route.fulfill({ json: { success: true, message: "OK", data } });

async function setupCourier(page: Page) {
  let shipment = { ...fixture };
  const calls: { url: URL; method: string; body: unknown }[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ url, method: req.method(), body: req.postDataJSON() });

    if (url.pathname.endsWith("/auth/refresh-token")) {
      return ok(route, { accessToken: "courier-jwt" });
    }
    if (url.pathname.endsWith("/users/me")) {
      return ok(route, {
        user: {
          id: "courier-1",
          name: "Karim Courier",
          email: "karim@expresshub.com",
          phone: "01799998888",
          role: "COURIER",
          isActive: true,
        },
      });
    }
    if (url.pathname.endsWith("/shipments/my-shipments")) {
      return ok(route, {
        shipments: [shipment],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }
    if (url.pathname.endsWith(`/shipments/${shipmentId}`)) {
      return ok(route, { shipment });
    }
    if (url.pathname.endsWith("/status") && req.method() === "PATCH") {
      const body = req.postDataJSON() as { status: string; note?: string };
      shipment = {
        ...shipment,
        status: body.status,
        ...(body.status === "DELIVERED" ? { deliveredAt: new Date().toISOString() } : {}),
      };
      return ok(route, { shipment });
    }

    return route.fulfill({ status: 404, json: { success: false, message: "Not found" } });
  });

  return calls;
}

test("Courier logs in, views assigned deliveries, and progresses delivery to completion", async ({
  page,
}) => {
  await setupCourier(page);

  // 1. Visit courier dashboard
  await page.goto("/courier");
  await expect(page.getByRole("heading", { name: "Delivery Dashboard" })).toBeVisible();

  // 2. Navigate to assigned deliveries
  await page.goto("/courier/shipments");
  await expect(page.getByText("EH-OPS-789")).toBeVisible();

  // 3. Open delivery detail
  await page.goto(`/courier/shipments/${shipmentId}`);
  await expect(page.getByText("EH-OPS-789")).toBeVisible();
  await expect(page.getByText("Sender Operations")).toBeVisible();
  await expect(page.getByText("Recipient Retail")).toBeVisible();

  // 4. Advance status: CREATED -> PICKED_UP
  const pickupBtn = page.getByRole("button", { name: /Mark as Picked up/i });
  await expect(pickupBtn).toBeVisible();
  await pickupBtn.click();

  // 5. Check confirmation toast or updated state
  await expect(page.getByText(/status successfully transitioned/i)).toBeVisible();
});
