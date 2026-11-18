import { expect, type Page } from "@playwright/test";

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async register(profile: { name: string; email: string; password: string }) {
    await this.page.goto("/register");
    await this.page.getByLabel("Full name").fill(profile.name);
    await this.page.getByLabel("Email address").fill(profile.email);
    await this.page.getByLabel("Password", { exact: true }).fill(profile.password);
    await this.page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(this.page).toHaveURL(/\/customer$/);
  }
}

export class BookingPage {
  constructor(private readonly page: Page) {}

  async book(parcel: { weightKg: string }) {
    const page = this.page;
    await page.goto("/customer/shipments/new");
    await page.getByLabel("Pickup contact name").fill("E2E Sender");
    await page.getByLabel("Pickup phone").fill("01700000001");
    await page.getByLabel("Pickup address", { exact: true }).fill("10 Pickup Lane, Dhaka");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Recipient name").fill("E2E Recipient");
    await page.getByLabel("Recipient phone").fill("01800000002");
    await page.getByLabel("Delivery address", { exact: true }).fill("20 Delivery Street, Dhaka");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Weight (kg)").fill(parcel.weightKg);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your shipment" })).toBeVisible();
    await page.getByRole("button", { name: "Create shipment", exact: true }).click();
    await expect(page).toHaveURL(/\/customer\/shipments\/[a-z0-9]+$/);
    const trackingNumber = (await page.getByText(/^EH-[0-9A-F]{24}$/).first().textContent())?.trim();
    expect(trackingNumber).toMatch(/^EH-[0-9A-F]{24}$/);
    return { id: page.url().split("/").pop()!, trackingNumber: trackingNumber! };
  }
}

export class CustomerShipmentPage {
  constructor(private readonly page: Page) {}

  async open(id: string) {
    await this.page.goto(`/customer/shipments/${id}`);
    await expect(this.page.getByRole("heading", { name: "Shipment details" })).toBeVisible();
  }

  // Each entry shows the event type as its heading and the new status as a badge.
  timelineEntries() {
    return this.page.locator(".shipment-timeline > li");
  }
}
