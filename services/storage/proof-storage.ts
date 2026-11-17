import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export interface StoredObject {
  data: Uint8Array;
  contentType: string;
}

// Where proof images live. The Postgres driver keeps deployments free of extra
// services; an S3-compatible driver can implement the same three methods.
export interface ProofStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
}

type Db = PrismaClient | Prisma.TransactionClient;

export function postgresProofStorage(db: Db): ProofStorage {
  return {
    async put(key, data, contentType) {
      await db.storedFile.create({ data: { key, contentType, size: data.length, data: Buffer.from(data) } });
    },
    async get(key) {
      const file = await db.storedFile.findUnique({ where: { key }, select: { data: true, contentType: true } });
      return file ? { data: new Uint8Array(file.data), contentType: file.contentType } : null;
    },
    async delete(keys) {
      if (keys.length) await db.storedFile.deleteMany({ where: { key: { in: keys } } });
    },
  };
}

// Unguessable keys, so a leaked key never reveals or enumerates other proofs.
export function newStorageKey(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}
