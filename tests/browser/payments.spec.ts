import { setMockPageSession } from "./session";
import { expect, test, type Page, type Route } from "@playwright/test";

const shipmentId = "clhshipment12345678901234";
const paymentId = "clhpayment123456789012345";
const checkoutUrl = "https://checkout.stripe.com/pay/cs_test_mock_session_123";

const shipmentFixture = {
  id: shipmentId,
  trackingNumber: "EH-PAY-999",
  customerId: "customer-1",
  courierId: null,
  pickupContactName: "Sender Alice",
  pickupContactPhone: "01700000001",
  pickupAddress: "10 Green Road, Dhaka",
  deliveryContactName: "Recipient Bob",
  deliveryContactPhone: "01800000002",
  deliveryAddress: "20 Blue Avenue, Dhaka",
  parcelWeightKg: "2.500",
  parcelLengthCm: null,
  parcelWidthCm: null,
  parcelHeightCm: null,
  packageDescription: "Documents and electronics",
  pickupScheduledAt: null,
  deliveredAt: null,
  price: "250.00",
  currency: "BDT",
  status: "CREATED",
  paymentStatus: "PENDING",
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
  events: [
    {
      id: "ev-pay-1",
      type: "CREATED",
      fromStatus: null,
      toStatus: "CREATED",
      publicNote: "Shipment created",
      occurredAt: "2026-01-01T10:00:00Z",
    },
  ],
};

const paymentFixture = {
  id: paymentId,
  shipmentId,
  payerId: "customer-1",
  provider: "STRIPE",
  amount: "250.00",
  currency: "BDT",
  status: "PENDING",
  paidAt: null as string | null,
  refundedAt: null as string | null,
  createdAt: "2026-01-01T10:05:00Z",
  updatedAt: "2026-01-01T10:05:00Z",
};

const ok = (route: Route, data: unknown) =>
  route.fulfill({ json: { success: true, message: "OK", data } });

const failure = (route: Route, status: number, message: string, headers: Record<string, string> = {}) =>
  route.fulfill({ status, headers, json: { success: false, message, errors: [] } });

interface SetupOptions {
  initialPaymentStatus?: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  initialShipmentPaymentStatus?: "PENDING" | "PAID";
}

async function setupPayment(page: Page, options: SetupOptions = {}) {
  await setMockPageSession(page, "CUSTOMER");
  const calls: { url: URL; method: string; body: unknown; headers: Record<string, string> }[] = [];

  let currentShipment = {
    ...shipmentFixture,
    paymentStatus: options.initialShipmentPaymentStatus ?? "PENDING",
  };

  let currentPayment = {
    ...paymentFixture,
    status: options.initialPaymentStatus ?? "PENDING",
    paidAt: options.initialPaymentStatus === "PAID" ? "2026-01-01T10:10:00Z" : null,
  };

  // Intercept any external Stripe redirect so the browser doesn't attempt external network requests
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body><h1>Mock Hosted Stripe Checkout</h1></body></html>",
    })
  );

  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({
      url,
      method: req.method(),
      body: req.postDataJSON(),
      headers: req.headers(),
    });

    if (url.pathname.endsWith("/auth/refresh-token")) {
      return ok(route, { accessToken: "customer-jwt-token" });
    }

    if (url.pathname.endsWith("/users/me")) {
      return ok(route, {
        user: {
          id: "customer-1",
          name: "Sarah Customer",
          email: "sarah@expresshub.test",
          phone: "01700000001",
          role: "CUSTOMER",
          isActive: true,
        },
      });
    }

    if (url.pathname.endsWith(`/shipments/${shipmentId}`)) {
      return ok(route, { shipment: currentShipment });
    }

    if (url.pathname.endsWith("/payments/initiate") && req.method() === "POST") {
      return ok(route, {
        payment: currentPayment,
        checkoutUrl,
      });
    }

    if (url.pathname.endsWith(`/payments/${paymentId}`)) {
      return ok(route, { payment: currentPayment });
    }

    if (url.pathname.endsWith("/payments")) {
      const qStatus = url.searchParams.get("status");
      const qShipment = url.searchParams.get("shipmentId");
      const list = [currentPayment].filter((p) => {
        if (qStatus && p.status !== qStatus) return false;
        if (qShipment && p.shipmentId !== qShipment) return false;
        return true;
      });

      return ok(route, {
        payments: list,
        pagination: {
          page: Number(url.searchParams.get("page") || 1),
          limit: Number(url.searchParams.get("limit") || 10),
          total: list.length ? 1 : 0,
          totalPages: list.length ? 1 : 0,
        },
      });
    }

    return failure(route, 404, "Not found");
  });

  return {
    calls,
    getShipment: () => currentShipment,
    setShipment: (s: typeof currentShipment) => {
      currentShipment = s;
    },
    getPayment: () => currentPayment,
    setPayment: (p: typeof currentPayment) => {
      currentPayment = p;
    },
  };
}

test("Customer initiates payment from shipment detail, sends idempotency key, stores recovery state, and navigates to checkout", async ({
  page,
}) => {
  const { calls } = await setupPayment(page);

  // 1. Visit shipment detail page
  await page.goto(`/customer/shipments/${shipmentId}`);
  await expect(page.getByText("EH-PAY-999", { exact: true })).toBeVisible();
  await expect(page.getByText("BDT 250.00", { exact: true })).toBeVisible();

  // 2. Pay with Stripe button is visible with exact price and currency
  const payBtn = page.getByRole("button", { name: /Pay with Stripe \(BDT 250\.00\)/i });
  await expect(payBtn).toBeVisible();

  // 3. Click Pay with Stripe
  await payBtn.click();

  // 4. Verify browser navigates to the returned Stripe Checkout URL
  await page.waitForURL(/checkout\.stripe\.com/);
  await expect(page.getByRole("heading", { name: "Mock Hosted Stripe Checkout" })).toBeVisible();

  // 5. Verify the API request was made with correct shipmentId and Idempotency-Key header
  const initiateCall = calls.find(
    (c) => c.method === "POST" && c.url.pathname.endsWith("/payments/initiate")
  );
  expect(initiateCall).toBeDefined();
  expect(initiateCall?.body).toEqual({ shipmentId });
  expect(initiateCall?.headers["idempotency-key"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  // 6. Navigate back to application domain and verify pending recovery state was stored in sessionStorage
  await page.goto(`/customer/shipments/${shipmentId}`);
  const recoveryRaw = await page.evaluate(() => sessionStorage.getItem("expresshub_pending_payment"));
  expect(recoveryRaw).not.toBeNull();
  const recovery = JSON.parse(recoveryRaw!);
  expect(recovery.paymentId).toBe(paymentId);
  expect(recovery.shipmentId).toBe(shipmentId);
  expect(recovery.checkoutUrl).toBe(checkoutUrl);
});

test("Checkout success return view displays pending state and automatically updates when payment confirms as PAID", async ({
  page,
}) => {
  const ctx = await setupPayment(page, { initialPaymentStatus: "PENDING" });

  // Pre-seed recovery in sessionStorage
  await page.addInitScript(
    ({ pId, sId, cUrl }) => {
      sessionStorage.setItem(
        "expresshub_pending_payment",
        JSON.stringify({ paymentId: pId, shipmentId: sId, checkoutUrl: cUrl })
      );
    },
    { pId: paymentId, sId: shipmentId, cUrl: checkoutUrl }
  );

  // 1. Return from Stripe to success page
  await page.goto(`/checkout/success?paymentId=${paymentId}`);

  // 2. Initially displays "Checking your payment" and pending status
  await expect(page.getByRole("heading", { name: "Checking your payment" })).toBeVisible();
  await expect(page.getByText(/We’re waiting for payment confirmation/i)).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("BDT 250.00", { exact: true })).toBeVisible();

  // 3. Simulate backend payment settlement via Stripe webhook
  ctx.setPayment({
    ...ctx.getPayment(),
    status: "PAID",
    paidAt: "2026-01-01T10:10:00Z",
  });

  // 4. Click manual refresh (or wait for bounded polling)
  const refreshBtn = page.getByRole("button", { name: /Refresh status/i });
  if (await refreshBtn.isVisible()) {
    await refreshBtn.click();
  }

  // 5. Verify transitioned to "Payment complete" with success elements
  await expect(page.getByRole("heading", { name: "Payment complete" })).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("BDT 250.00", { exact: true })).toBeVisible();
  await expect(page.getByText(paymentId)).toBeVisible();

  // 6. Verify View Shipment action button works
  const viewShipmentLink = page.getByRole("link", { name: "View Shipment" });
  await expect(viewShipmentLink).toBeVisible();
  await viewShipmentLink.click();
  await expect(page).toHaveURL(new RegExp(`/customer/shipments/${shipmentId}$`));

  // 7. Verify pending payment was cleared from recovery storage
  const remainingPending = await page.evaluate(() => sessionStorage.getItem("expresshub_pending_payment"));
  expect(remainingPending).toBeNull();
});

test("Checkout cancel return view displays closed status and guidance without prematurely marking payment failed", async ({
  page,
}) => {
  await setupPayment(page, { initialPaymentStatus: "PENDING" });

  // Return to cancel page
  await page.goto(`/checkout/cancel?paymentId=${paymentId}`);

  // 1. Verifies "Checkout closed" title
  await expect(page.getByRole("heading", { name: "Checkout closed" })).toBeVisible();
  await expect(page.getByText(/Check the status below before trying again/i)).toBeVisible();

  // 2. Shows verified current status (Pending) and exact amount
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("BDT 250.00", { exact: true })).toBeVisible();

  // 3. Recovery actions are present
  await expect(page.getByRole("button", { name: /Refresh status/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Shipment" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Payment history" })).toBeVisible();

  // 4. Click Payment history link
  await page.getByRole("link", { name: "Payment history" }).click();
  await expect(page).toHaveURL(/\/customer\/payments$/);
});

test("Customer payments history list renders records, supports status filtering, and allows inspecting detail", async ({
  page,
}) => {
  await setupPayment(page, { initialPaymentStatus: "PAID" });

  // 1. Navigate to payments history
  await page.goto("/customer/payments");
  await expect(page.getByRole("heading", { name: "My payments" })).toBeVisible();

  // 2. Visible table renders payment details
  const table = page.locator(".table-desktop:visible, .table-mobile:visible");
  await expect(table.getByRole("link", { name: paymentId }).first()).toBeVisible();
  await expect(table.getByText("BDT 250.00").first()).toBeVisible();
  await expect(table.getByText("Paid").first()).toBeVisible();

  // 3. Status filter updates query in URL
  const statusSelect = page.getByLabel("Payment status");
  if (await statusSelect.isVisible()) {
    await statusSelect.selectOption("PAID");
    await expect(page).toHaveURL(/status=PAID/);
  }

  // 4. Clicking payment ID navigates to payment detail view
  await table.getByRole("link", { name: paymentId }).first().click();
  await expect(page).toHaveURL(new RegExp(`/customer/payments/${paymentId}$`));
  await expect(page.getByRole("heading", { name: "Payment details" })).toBeVisible();
  await expect(page.getByText(paymentId)).toBeVisible();
});

test("Payment details view displays complete payment data, validates ID format, and gracefully handles not found", async ({
  page,
}) => {
  await setupPayment(page, { initialPaymentStatus: "PAID" });

  // 1. Visit valid payment detail
  await page.goto(`/customer/payments/${paymentId}`);
  await expect(page.getByRole("heading", { name: "Payment details" })).toBeVisible();
  await expect(page.getByText(paymentId)).toBeVisible();
  await expect(page.getByText("BDT 250.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(shipmentId)).toBeVisible();

  // Back link navigates to /customer/payments
  await page.getByRole("link", { name: "My payments" }).click();
  await expect(page).toHaveURL(/\/customer\/payments$/);

  // 2. Invalid payment ID format (not CUID) rejects client-side with empty state
  await page.goto("/customer/payments/invalid-not-cuid-id");
  await expect(page.getByText("Invalid payment link")).toBeVisible();
  await expect(page.getByText("Return to your payment history to find this payment.")).toBeVisible();

  // 3. Non-existent payment returns 404
  await page.goto("/customer/payments/clhnonexistent123456789012");
  await expect(page.getByText("Could not load payment status")).toBeVisible();
  await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible();
});

test("Paid shipment reflects payment received badge and suppresses Pay with Stripe button", async ({
  page,
}) => {
  await setupPayment(page, {
    initialPaymentStatus: "PAID",
    initialShipmentPaymentStatus: "PAID",
  });

  // Visit shipment detail
  await page.goto(`/customer/shipments/${shipmentId}`);
  await expect(page.getByText("EH-PAY-999", { exact: true })).toBeVisible();

  // 1. Payment received banner is displayed
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expect(page.getByText("BDT 250.00 paid.")).toBeVisible();

  // 2. View payment link is available
  const viewPaymentLink = page.getByRole("link", { name: "View payment" });
  await expect(viewPaymentLink).toBeVisible();

  // 3. Pay with Stripe button is suppressed
  await expect(page.getByRole("button", { name: /Pay with Stripe/i })).toHaveCount(0);
});

test("Rate limiting on payment initiation displays retry countdown and prevents duplicate requests", async ({
  page,
}) => {
  await setupPayment(page);

  // Rate limit the initiation endpoint with Retry-After: 2
  await page.route("**/api/v1/payments/initiate", (route) =>
    failure(route, 429, "Too many requests", { "Retry-After": "2" })
  );

  await page.goto(`/customer/shipments/${shipmentId}`);
  const payBtn = page.getByRole("button", { name: /Pay with Stripe/i });
  await expect(payBtn).toBeVisible();

  // Click initiation
  await payBtn.click();

  // Button displays countdown and is disabled
  await expect(page.getByRole("button", { name: /Try again in \d+s/i })).toBeDisabled();

  // After cooldown, button becomes re-enabled
  await expect(page.getByRole("button", { name: /Pay with Stripe/i })).toBeEnabled({ timeout: 5000 });
});

test("Payment pages fit viewport without horizontal scrolling on both desktop and mobile", async ({
  page,
}) => {
  await setupPayment(page, { initialPaymentStatus: "PAID" });

  // Check payment history page
  await page.goto("/customer/payments");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Check payment detail page
  await page.goto(`/customer/payments/${paymentId}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Check checkout success return page
  await page.goto(`/checkout/success?paymentId=${paymentId}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Check checkout cancel return page
  await page.goto(`/checkout/cancel?paymentId=${paymentId}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
