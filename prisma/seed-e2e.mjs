// End-to-end test data. Everything here is owned by the e2e suite: users on the
// reserved expresshub.test domain, one hub and, only when no active rule already
// prices the e2e weight, one pricing rule. Nothing else in the database is changed.
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export const E2E_DOMAIN = "expresshub.test";
export const E2E_PASSWORD = "E2e-Password-123!";
export const E2E_WEIGHT_KG = "2.500";
export const E2E_HUB_CODE = "E2E-HUB";
export const E2E_RULE_NAME = "E2E pricing rule";
export const E2E_USERS = {
  ADMIN: { email: `e2e-admin@${E2E_DOMAIN}`, name: "E2E Admin" },
  COURIER: { email: `e2e-courier@${E2E_DOMAIN}`, name: "E2E Courier" },
  CUSTOMER: { email: `e2e-customer@${E2E_DOMAIN}`, name: "E2E Customer" },
};

const ownedUsers = { email: { endsWith: `@${E2E_DOMAIN}` } };

export async function seedE2e(prisma) {
  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);
  const users = {};
  for (const [role, profile] of Object.entries(E2E_USERS)) {
    users[role] = await prisma.user.upsert({
      where: { email: profile.email },
      update: { role, isActive: true, deletedAt: null, passwordHash },
      create: { ...profile, role, passwordHash, phone: "01700000000" },
    });
  }

  await prisma.hub.upsert({
    where: { code: E2E_HUB_CODE },
    update: { isActive: true, deletedAt: null },
    create: { code: E2E_HUB_CODE, name: "E2E Dhaka Hub", address: "1 Test Road, Dhaka", zoneCode: "DHK" },
  });

  // Bookings need exactly one active rule for the weight. A fresh CI database has
  // none, so the suite adds its own; a database that already prices it is left alone.
  const covering = await prisma.pricingRule.count({
    where: { isActive: true, minWeightKg: { lte: E2E_WEIGHT_KG }, maxWeightKg: { gte: E2E_WEIGHT_KG } },
  });
  if (covering === 0) {
    await prisma.pricingRule.create({
      data: { name: E2E_RULE_NAME, minWeightKg: "0.001", maxWeightKg: "9999999.999", baseFee: "120", additionalPerKgFee: "20", currency: "BDT" },
    });
  }
  return users;
}

// A paid, unassigned shipment for the dispatch journey. Payment is recorded directly
// because the suite never contacts Stripe.
export async function createPaidShipment(prisma, customerId) {
  const trackingNumber = `EH-${randomBytes(12).toString("hex").toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        trackingNumber,
        customerId,
        pickupContactName: "E2E Sender",
        pickupContactPhone: "01700000001",
        pickupAddress: "10 Pickup Lane, Dhaka",
        deliveryContactName: "E2E Recipient",
        deliveryContactPhone: "01800000002",
        deliveryAddress: "20 Delivery Street, Dhaka",
        parcelWeightKg: E2E_WEIGHT_KG,
        price: "150.00",
        paymentStatus: "PAID",
        events: { create: { type: "CREATED", toStatus: "CREATED", publicNote: "Shipment booked" } },
      },
    });
    await tx.payment.create({
      data: {
        shipmentId: shipment.id,
        payerId: customerId,
        provider: "STRIPE",
        idempotencyKey: `e2e-${shipment.id}`,
        amount: "150.00",
        status: "PAID",
        paidAt: new Date(),
      },
    });
    return shipment;
  });
}

export async function cleanupE2e(prisma) {
  const users = (await prisma.user.findMany({ where: ownedUsers, select: { id: true } })).map((user) => user.id);
  if (users.length) {
    const shipments = (await prisma.shipment.findMany({
      where: { OR: [{ customerId: { in: users } }, { courierId: { in: users } }] },
      select: { id: true },
    })).map((shipment) => shipment.id);
    if (shipments.length) {
      const keys = (await prisma.deliveryProof.findMany({
        where: { shipmentId: { in: shipments } },
        select: { photoKey: true, signatureKey: true },
      })).flatMap((proof) => [proof.photoKey, proof.signatureKey]).filter(Boolean);
      if (keys.length) await prisma.storedFile.deleteMany({ where: { key: { in: keys } } });
      await prisma.auditLog.deleteMany({ where: { shipmentId: { in: shipments } } });
      await prisma.payment.deleteMany({ where: { shipmentId: { in: shipments } } });
      await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: shipments } } });
      await prisma.shipment.deleteMany({ where: { id: { in: shipments } } });
    }
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.pricingRule.deleteMany({ where: { name: E2E_RULE_NAME } });
  await prisma.hub.deleteMany({ where: { code: E2E_HUB_CODE } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  try {
    if (process.argv.includes("--cleanup")) {
      await cleanupE2e(prisma);
      console.info("E2E data removed.");
    } else {
      await seedE2e(prisma);
      console.info("E2E data seeded.");
    }
  } finally {
    await prisma.$disconnect();
  }
}
