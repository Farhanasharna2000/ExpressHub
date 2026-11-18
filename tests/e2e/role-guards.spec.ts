import { expect, test } from "./support/fixtures";

test("a customer cannot open the admin workspace", async ({ signedInPage }) => {
  const customer = await signedInPage("CUSTOMER");
  await customer.goto("/admin");
  await expect(customer).not.toHaveURL(/\/admin(\/|$)/);
  await expect(customer.getByRole("heading", { name: /Admin|Operations dashboard/i })).toHaveCount(0);
});

test("a courier cannot open customer payments", async ({ signedInPage }) => {
  const courier = await signedInPage("COURIER");
  await courier.goto("/customer/payments");
  await expect(courier).not.toHaveURL(/\/customer\/payments/);
});

test("an anonymous visitor is sent to login before any workspace renders", async ({ page }) => {
  for (const path of ["/admin", "/courier", "/customer/shipments"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replaceAll("%2F", "(%2F|/)")}`));
  }
});
