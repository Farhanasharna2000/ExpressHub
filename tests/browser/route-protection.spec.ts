import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { browserTestSecret } from "./session";

test("protected requests redirect before any browser JavaScript executes", async ({ request }) => {
  for (const path of ["/admin/users", "/courier/shipments", "/customer/shipments?q=Dhaka%20City&page=2", "/profile", "/checkout/success?session_id=cs_test"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location, response.url());
    expect(location.pathname).toBe("/login");
    const next = new URL(location.searchParams.get("next")!, response.url());
    const expected = new URL(path, response.url());
    expect(next.pathname).toBe(expected.pathname);
    expect([...next.searchParams]).toEqual([...expected.searchParams]);
  }
});

test("the deployed proxy verifies role cookies and keeps login reachable", async ({ request }) => {
  const token = jwt.sign({ role: "CUSTOMER", tokenType: "page" }, browserTestSecret, {
    algorithm: "HS256", subject: "test-user", issuer: "expresshub", audience: "expresshub-pages", expiresIn: "1h",
  });
  const headers = { cookie: `expresshub_page_session=${token}` };
  expect((await request.get("/customer", { headers, maxRedirects: 0 })).status()).toBe(200);
  const forbidden = await request.get("/admin", { headers, maxRedirects: 0 });
  expect(forbidden.status()).toBe(307);
  expect(new URL(forbidden.headers().location, forbidden.url()).pathname).toBe("/customer");
  expect((await request.get("/login", { headers, maxRedirects: 0 })).status()).toBe(200);
  const invalid = await request.get("/admin", { headers: { cookie: `expresshub_page_session=${token}tampered` }, maxRedirects: 0 });
  expect(invalid.status()).toBe(307);
  expect(new URL(invalid.headers().location, invalid.url()).pathname).toBe("/login");
});
