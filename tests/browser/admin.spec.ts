import { setMockPageSession } from "./session";
import { expect, test, type Page, type Route } from "@playwright/test";

const ok = (route: Route, data: unknown) =>
  route.fulfill({ json: { success: true, message: "OK", data } });

async function setupAdmin(page: Page) {
  await setMockPageSession(page, "ADMIN");
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (url.pathname.endsWith("/auth/refresh-token")) {
      return ok(route, { accessToken: "admin-jwt" });
    }
    if (url.pathname.endsWith("/users/me")) {
      return ok(route, {
        user: {
          id: "admin-1",
          name: "Chief Admin",
          email: "admin@expresshub.com",
          phone: "01711119999",
          role: "ADMIN",
          isActive: true,
        },
      });
    }
    if (url.pathname.endsWith("/admin/dashboard-stats")) {
      return ok(route, {
        users: { total: 42, active: 40, inactive: 2, byRole: { CUSTOMER: 35, COURIER: 5, ADMIN: 2 } },
        shipments: {
          total: 120,
          active: 18,
          byStatus: {
            CREATED: 5,
            PICKED_UP: 3,
            IN_TRANSIT: 6,
            OUT_FOR_DELIVERY: 4,
            DELIVERED: 95,
            FAILED: 2,
            RETURNED: 3,
            CANCELLED: 2,
          },
        },
        payments: {
          total: 118,
          byStatus: { PAID: 110, PENDING: 6, FAILED: 2, REFUND_PENDING: 0, REFUNDED: 0 },
          amounts: [{ currency: "BDT", status: "PAID", count: 110, amount: "48500.00" }],
        },
      });
    }
    if (url.pathname.endsWith("/users")) {
      return ok(route, {
        users: [
          {
            id: "user-2",
            name: "Customer Jane",
            email: "jane@example.com",
            phone: "01722223333",
            role: "CUSTOMER",
            isActive: true,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }
    if (url.pathname.endsWith("/admin/audit-logs")) {
      return ok(route, {
        auditLogs: [
          {
            id: "log-1",
            actorId: "admin-1",
            entityType: "USER",
            entityId: "user-2",
            shipmentId: null,
            paymentId: null,
            action: "USER_ROLE_UPDATED",
            details: { before: { role: "CUSTOMER" }, after: { role: "COURIER" } },
            createdAt: "2026-01-02T10:00:00Z",
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }

    return route.fulfill({ status: 404, json: { success: false, message: "Not found" } });
  });
}

test("Admin logs in, inspects dashboard stats, manages users, and reviews audit ledger", async ({
  page,
}) => {
  await setupAdmin(page);

  // 1. Visit admin dashboard overview
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Operations Overview" })).toBeVisible();
  await expect(page.getByText("120")).toBeVisible(); // total shipments
  await expect(page.getByText("42")).toBeVisible(); // total users

  // 2. Navigate to user directory
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.getByText("Customer Jane")).toBeVisible();

  // 3. Navigate to audit logs
  await page.goto("/admin/audit-logs");
  await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();
  await expect(page.getByText("Role updated")).toBeVisible();
});
