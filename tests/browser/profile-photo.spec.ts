import { test, expect } from "@playwright/test";

test("profile photo upload, persistence, removal, and mobile layout", async ({ page }) => {
  let current = { id: "user-1", name: "Alex Sender", email: "alex@example.com", phone: null, avatar: null as string | null, role: "CUSTOMER", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith("/auth/refresh-token")) data = { accessToken: "test-access-token" };
    else if (path.endsWith("/users/me")) {
      if (route.request().method() === "PATCH") current = { ...current, ...route.request().postDataJSON() };
      data = { user: current };
    } else return route.fulfill({ status: 404, json: { success: false, message: "Not found" } });
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#196547"; ctx.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png");
  });
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  await expect(page.getByAltText("Your profile photo")).toBeVisible();
  await page.getByLabel("Full name").fill("Alex Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible();
  expect(current.avatar).toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.getByAltText("Your profile photo")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Updated");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible();
  expect(current.avatar).toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
  await expect(page.getByAltText("Your profile photo")).toHaveCount(0);
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.getByText("Choose a JPG, PNG, or WebP image.")).toBeVisible();
});
