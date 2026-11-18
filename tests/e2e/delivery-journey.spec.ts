import { E2E_USERS } from "../../prisma/seed-e2e.mjs";
import { CustomerShipmentPage } from "./pages/customer";
import { AdminShipmentPage, CourierShipmentPage } from "./pages/operations";
import { expect, test } from "./support/fixtures";

test("admin assigns a paid shipment, the courier delivers it with proof, customer and public see it", async ({ signedInPage, paidShipment, db, browser, baseURL }) => {
  const shipment = await paidShipment();

  const admin = await signedInPage("ADMIN");
  const adminShipment = new AdminShipmentPage(admin);
  await adminShipment.open(shipment.id);
  await adminShipment.assignCourier(E2E_USERS.COURIER.email);

  const courier = await signedInPage("COURIER");
  const courierShipment = new CourierShipmentPage(courier);
  await courierShipment.open(shipment.id);
  await courierShipment.advanceTo("Picked up");
  await courierShipment.advanceTo("In transit");
  await courierShipment.advanceTo("Out for delivery");
  await courierShipment.confirmDeliveryWithPhoto("Rahim Uddin");

  const stored = await db.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { deliveryProof: true } });
  expect(stored.status).toBe("DELIVERED");
  expect(stored.deliveryProof?.recipientName).toBe("Rahim Uddin");
  expect(stored.deliveryProof?.photoKey).toBeTruthy();

  const customer = await signedInPage("CUSTOMER");
  const customerShipment = new CustomerShipmentPage(customer);
  await customerShipment.open(shipment.id);
  await expect(customerShipment.timelineEntries().last()).toContainText("Delivered");
  await expect(customer.getByText("Rahim Uddin").first()).toBeVisible();

  // Anyone with the tracking number sees the final status, without signing in.
  const visitorContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/track/${shipment.trackingNumber}`);
  await expect(visitor.getByText("Delivered").first()).toBeVisible();
  await expect(visitor.getByText("E2E Recipient")).toHaveCount(0);
  await visitorContext.close();
});
