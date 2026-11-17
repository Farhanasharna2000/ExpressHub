import "server-only";
import { Prisma } from "@prisma/client";
import { requireRole, type AuthenticatedUser } from "@/lib/auth/require-user";
import {
  canViewProof,
  cleanProofImage,
  ProofImageError,
  proofSummary,
  resolveCapturedAt,
  type CleanProofImage,
  type ProofKind,
} from "@/lib/delivery-proof";
import { AppError } from "@/lib/http/errors";
import prisma from "@/lib/prisma";
import { newStorageKey, postgresProofStorage, type StoredObject } from "@/services/storage/proof-storage";
import type { ProofFields } from "@/validators/proof";

export interface ProofUpload extends ProofFields {
  photo?: Uint8Array;
  signature?: Uint8Array;
}

const notFound = () => new AppError(404, "Shipment not found", "SHIPMENT_NOT_FOUND");

function clean(bytes: Uint8Array | undefined, label: string): CleanProofImage | null {
  if (!bytes) return null;
  try {
    return cleanProofImage(bytes);
  } catch (error) {
    if (error instanceof ProofImageError) throw new AppError(400, `${label}: ${error.message}`, "INVALID_PROOF_IMAGE");
    throw error;
  }
}

// Saves or replaces the proof for a shipment the courier is delivering right now.
// Images are validated and stripped of metadata before anything is stored.
export async function saveDeliveryProof(actor: AuthenticatedUser, shipmentId: string, input: ProofUpload, now = new Date()) {
  requireRole(actor, "COURIER");
  const photo = clean(input.photo, "Photo");
  const signature = clean(input.signature, "Signature");
  if (!photo && !signature) {
    throw new AppError(400, "Add a photo of the delivery or the recipient's signature", "PROOF_IMAGE_REQUIRED");
  }
  const capturedAt = resolveCapturedAt(input.capturedAt, now);

  try {
    return await prisma.$transaction(async (tx) => {
      const courier = await tx.user.findFirst({
        where: { id: actor.id, role: "COURIER", isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!courier) throw new AppError(403, "An active courier account is required", "FORBIDDEN");
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, courierId: actor.id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!shipment) throw notFound();
      if (shipment.status !== "OUT_FOR_DELIVERY") {
        throw new AppError(409, "Proof can be captured only while the shipment is out for delivery", "PROOF_NOT_ALLOWED");
      }

      const storage = postgresProofStorage(tx);
      const existing = await tx.deliveryProof.findUnique({
        where: { shipmentId },
        select: { photoKey: true, signatureKey: true },
      });
      const photoKey = photo ? newStorageKey("photo") : null;
      const signatureKey = signature ? newStorageKey("signature") : null;
      if (photo && photoKey) await storage.put(photoKey, photo.data, photo.contentType);
      if (signature && signatureKey) await storage.put(signatureKey, signature.data, signature.contentType);

      const fields = { courierId: actor.id, recipientName: input.recipientName, photoKey, signatureKey, capturedAt };
      const proof = await tx.deliveryProof.upsert({
        where: { shipmentId },
        create: { shipmentId, ...fields },
        update: fields,
      });
      await storage.delete([existing?.photoKey, existing?.signatureKey].filter((key): key is string => Boolean(key)));

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          entityType: "SHIPMENT",
          entityId: shipmentId,
          shipmentId,
          action: "DELIVERY_PROOF_CAPTURED",
          details: {
            hasPhoto: Boolean(photo),
            hasSignature: Boolean(signature),
            photoBytes: photo?.data.length ?? 0,
            signatureBytes: signature?.data.length ?? 0,
            capturedAt: capturedAt.toISOString(),
            replaced: Boolean(existing),
          },
        },
      });
      return proofSummary(proof);
    });
  } catch (error) {
    // Two uploads racing for the same shipment: the unique shipmentId keeps one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Proof was just saved from another device; reload the shipment", "PROOF_CONFLICT");
    }
    throw error;
  }
}

// Unknown shipments and shipments the viewer may not see both return 404.
export async function getProofImage(actor: AuthenticatedUser, shipmentId: string, kind: ProofKind): Promise<StoredObject> {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, deletedAt: null },
    select: { customerId: true, courierId: true, deliveryProof: { select: { photoKey: true, signatureKey: true } } },
  });
  if (!shipment || !canViewProof(actor, shipment)) throw notFound();
  const key = kind === "photo" ? shipment.deliveryProof?.photoKey : shipment.deliveryProof?.signatureKey;
  const image = key ? await postgresProofStorage(prisma).get(key) : null;
  if (!image) throw new AppError(404, "No proof image of this kind", "PROOF_NOT_FOUND");
  return image;
}
