import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { E2E_DOMAIN } from "../../prisma/seed-e2e.mjs";
import { expect, sessionCookies, test } from "./support/fixtures";

// Each test signs in a fresh customer: imports are limited to five uploads an hour per user,
// and the suite repeats. The global teardown removes these accounts and their shipments.
async function importer(browser: Browser, baseURL: string, db: Parameters<Parameters<typeof test>[2]>[0]["db"], locale: "en" | "bn" = "en") {
  const user = await db.user.create({
    data: { name: "E2E Importer", email: `e2e-import-${randomUUID().slice(0, 8)}@${E2E_DOMAIN}`, passwordHash: "x", role: "CUSTOMER", phone: "01700000000" },
  });
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  await context.addCookies([...(await sessionCookies(baseURL, user.id, "CUSTOMER")), { name: "locale", value: locale, domain: new URL(baseURL).hostname, path: "/" }]);
  return { user, context, page: await context.newPage() };
}

const HEADER = "pickupContactName,pickupContactPhone,pickupAddress,deliveryContactName,deliveryContactPhone,deliveryAddress,parcelWeightKg,packageDescription";
const line = (name: string, weight = "2.5") => `${name},01700000001,"House ${name}, Gulshan Dhaka",Rahim Uddin,01800000002,Agrabad ${name} Chattogram,${weight},Books`;
const csv = (...lines: string[]) => `${[HEADER, ...lines].join("\r\n")}\r\n`;
const file = (content: string, name = "shipments.csv") => ({ name, mimeType: "text/csv", buffer: Buffer.from(content) });

async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(blocking, `${name} has serious accessibility violations`).toEqual([]);
}

test("a customer imports a spreadsheet: preview, fix list, confirm, progress, result and report", async ({ browser, baseURL, db }) => {
  const { user, context, page } = await importer(browser, baseURL!, db);
  await page.goto("/customer/shipments");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(page).toHaveURL(/\/customer\/shipments\/import$/);
  await expect(page.getByRole("heading", { level: 1, name: "Import shipments from a spreadsheet" })).toBeVisible();
  await audit(page, "import-upload");

  // The template downloads and is a valid file.
  const templateDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  const template = await (await templateDownload).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of template) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString("utf8")).toContain("pickupContactName,pickupContactPhone");

  // Upload: three good rows, one bad weight and one missing name.
  await page.getByLabel("CSV file to import").setInputFiles(file(csv(line("Alpha"), line("Bravo", "1"), line("Charlie", "3.25"), line("Delta", "abc"), line("", "2"))));
  await expect(page.getByRole("heading", { name: "Check your file" })).toBeVisible();
  await expect(page.getByText("File: shipments.csv")).toBeVisible();
  const stats = page.locator("dl").first();
  await expect(stats.getByText("Ready to create").locator("xpath=following-sibling::dd")).toHaveText("3");
  await expect(stats.getByText("Need fixing").locator("xpath=following-sibling::dd")).toHaveText("2");
  await expect(stats.getByText("Estimated total").locator("xpath=following-sibling::dd")).toContainText("BDT");
  const problems = page.getByRole("table", { name: "Rows that need fixing" });
  await expect(problems.getByRole("row")).toHaveCount(3); // header + one problem per bad row
  await expect(problems).toContainText("Weight (kg)");
  await expect(problems).toContainText("Enter a number such as 2.5");
  await expect(problems).toContainText("This value is required");
  await expect(page.getByRole("table", { name: /first 3 rows that will be created/ }).getByRole("row")).toHaveCount(4);
  expect(await db.shipment.count({ where: { customerId: user.id } }), "a preview creates nothing").toBe(0);
  await audit(page, "import-preview");

  // Confirm; the rows are created in the background and the page follows along.
  await page.getByRole("button", { name: "Create 3 shipments" }).click();
  await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: "3 of 3 shipments created" })).toBeVisible();
  const created = await db.shipment.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "asc" } });
  expect(created.map((shipment) => shipment.pickupContactName).sort()).toEqual(["Alpha", "Bravo", "Charlie"]);
  expect(created.every((shipment) => shipment.status === "CREATED" && shipment.paymentStatus === "PENDING")).toBe(true);
  for (const shipment of created) await expect(page.getByRole("link", { name: shipment.trackingNumber })).toBeVisible();
  await audit(page, "import-result");

  // A reload keeps the result (the import id is in the address bar), and nothing is created twice.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible();
  expect(await db.shipment.count({ where: { customerId: user.id } })).toBe(3);

  // The rows that did not make it download as a CSV that can be fixed and uploaded again.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download problem rows" }).click();
  const report = await download;
  expect(report.suggestedFilename()).toMatch(/-errors\.csv$/);
  const body: Buffer[] = [];
  for await (const chunk of await report.createReadStream()) body.push(chunk as Buffer);
  const text = Buffer.concat(body).toString("utf8").replace(/^﻿/, "");
  expect(text.split("\r\n")[0]).toBe(`${HEADER.split(",").slice(0, 7).join(",")},packageDescription,parcelLengthCm,parcelWidthCm,parcelHeightCm,pickupScheduledAt,row,error`);
  expect(text).toContain("Delta");
  expect(text).toContain("Enter a number such as 2.5");

  // The new shipments show up in the list.
  await page.getByRole("link", { name: "View all in My shipments" }).click();
  await expect(page.getByRole("link", { name: created[0].trackingNumber }).first()).toBeVisible();
  await context.close();
});

test("the import page explains bad files and files that are too big", async ({ browser, baseURL, db }) => {
  const { context, page } = await importer(browser, baseURL!, db);
  await page.goto("/customer/shipments/import");
  const input = page.getByLabel("CSV file to import");

  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.locator("p[role=alert]")).toHaveText("Choose a .csv file.");

  await input.setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.alloc(1024 * 1024 + 10, "a") });
  await expect(page.locator("p[role=alert]")).toContainText("larger than 1 MB");

  await input.setInputFiles(file("pickupContactName\r\nRina\r\n"));
  await expect(page.locator("p[role=alert]")).toContainText("These required columns are missing");
  await expect(page.locator("p[role=alert]")).toContainText("parcelWeightKg");

  // The column guide lists every column, and a file with only problems cannot be confirmed.
  await page.locator("summary", { hasText: "What goes in the file" }).click();
  await expect(page.getByRole("table", { name: "What goes in the file" }).getByRole("row")).toHaveCount(13);
  await input.setInputFiles(file(csv(line("Nobody", "abc"))));
  await expect(page.getByText("None of the rows can be created")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create/ })).toBeDisabled();
  await page.getByRole("button", { name: "Choose another file" }).click();
  await expect(page.getByLabel("CSV file to import")).toBeAttached();
  await context.close();
});

test("the import works in Bangla, with Bangla digits and no accessibility problems", async ({ browser, baseURL, db }) => {
  const { user, context, page } = await importer(browser, baseURL!, db, "bn");
  await page.goto("/customer/shipments/import");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("স্প্রেডশিট থেকে শিপমেন্ট ইমপোর্ট করুন");
  await audit(page, "import-upload-bn");

  await page.getByLabel("ইমপোর্ট করার CSV ফাইল").setInputFiles(file(csv(line("Alpha"), line("Bravo", "১.৫"), line("Charlie", "abc"))));
  await expect(page.getByRole("heading", { name: "আপনার ফাইল দেখে নিন" })).toBeVisible();
  const stats = page.locator("dl").first();
  await expect(stats.getByText("তৈরির জন্য প্রস্তুত").locator("xpath=following-sibling::dd")).toHaveText("২");
  await expect(stats.getByText("ঠিক করতে হবে").locator("xpath=following-sibling::dd")).toHaveText("১");
  await expect(stats.getByText("আনুমানিক মোট").locator("xpath=following-sibling::dd")).toContainText("৳");
  await expect(page.getByRole("table", { name: "যে সারিগুলো ঠিক করতে হবে" })).toContainText("২.৫-এর মতো একটি সংখ্যা লিখুন");
  await audit(page, "import-preview-bn");

  await page.getByRole("button", { name: /তৈরি করুন/ }).click();
  await expect(page.getByRole("heading", { name: "ইমপোর্ট শেষ হয়েছে" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: "২টির মধ্যে ২টি শিপমেন্ট তৈরি হয়েছে" })).toBeVisible();
  expect(await db.shipment.count({ where: { customerId: user.id } })).toBe(2);
  await audit(page, "import-result-bn");
  await context.close();
});
