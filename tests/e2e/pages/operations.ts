import { expect, type Page } from "@playwright/test";

export class AdminShipmentPage {
  constructor(private readonly page: Page) {}

  async open(id: string) {
    await this.page.goto(`/admin/shipments/${id}`);
    await expect(this.page.getByText("Select Active Courier to Assign:")).toBeVisible();
  }

  async assignCourier(courierEmail: string) {
    const select = this.page.getByLabel("Select Active Courier to Assign:");
    const option = select.locator("option", { hasText: courierEmail });
    await expect(option).toHaveCount(1);
    await select.selectOption({ value: (await option.getAttribute("value"))! });
    await this.page.getByRole("button", { name: "Assign Courier", exact: true }).click();
    await expect(this.page.getByText("Assignment Confirmed").first()).toBeVisible();
  }
}

export class CourierShipmentPage {
  constructor(private readonly page: Page) {}

  async open(id: string) {
    await this.page.goto(`/courier/shipments/${id}`);
    await expect(this.page.getByText("Payment confirmation")).toBeVisible();
  }

  async advanceTo(label: "Picked up" | "In transit" | "Out for delivery") {
    await this.page.getByRole("button", { name: `Mark as ${label}`, exact: true }).click();
    await expect(this.page.getByText(`Current status: ${label}`)).toBeVisible();
  }

  // Proof photos are produced by the browser's own canvas so no binary fixture is needed.
  async confirmDeliveryWithPhoto(recipientName: string) {
    const page = this.page;
    const base64 = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#1f6f4a";
      context.fillRect(0, 0, 320, 240);
      context.fillStyle = "#ffffff";
      context.fillRect(100, 70, 120, 100);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    await expect(page.getByText("Take a photo of the parcel at the door")).toBeVisible();
    await page.getByLabel("Received by").fill(recipientName);
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "parcel.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64"),
    });
    await expect(page.getByRole("img", { name: "Delivery photo to be uploaded" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm delivery", exact: true }).click();
    await expect(page.getByText("Delivered", { exact: true }).first()).toBeVisible();
  }
}
