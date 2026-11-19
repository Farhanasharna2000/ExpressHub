import { AdminShipmentPage } from "./pages/operations";
import { expect, test } from "./support/fixtures";

// AI is disabled for the suite, so this exercises the rule-based ranking end to end.
test("admin gets courier suggestions for a waiting shipment and assigns one with one click", async ({ signedInPage, paidShipment, db }) => {
  const shipment = await paidShipment();
  const admin = await signedInPage("ADMIN");

  await admin.goto("/admin");
  await expect(admin.getByTestId("dispatch-queue")).toBeVisible();

  await new AdminShipmentPage(admin).open(shipment.id);
  const panel = admin.getByTestId("dispatch-suggestions");
  await panel.getByRole("button", { name: "Suggest couriers" }).click();
  const options = panel.getByRole("listitem");
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeLessThanOrEqual(3);
  await expect(panel.getByText("Rule-based suggestions: AI is not enabled.")).toBeVisible();

  const name = (await options.first().locator("p").first().textContent())?.trim();
  await options.first().getByRole("button", { name: `Assign ${name}` }).click();
  await expect(admin.getByText("Courier assigned").first()).toBeVisible();

  await expect.poll(async () => (await db.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { courier: true } })).courier?.name).toBe(name);
  // Once assigned, the shipment no longer needs dispatching.
  await expect(panel).toHaveCount(0);
});
