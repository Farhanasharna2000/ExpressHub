import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

// WEBHOOK_ENCRYPTION_KEY is 32 random bytes, base64 encoded (`openssl rand -base64 32`).
// Returns null when it is missing or malformed, so webhooks can be switched off cleanly.
export function webhookEncryptionKey(env: Record<string, string | undefined> = process.env) {
  const raw = env.WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

// AES-256-GCM. Output: v1.<iv>.<auth tag>.<ciphertext>, each part base64url.
export function encryptSecret(plaintext: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, key: Buffer) {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
