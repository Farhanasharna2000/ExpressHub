// Pure helpers for proof-of-delivery images and access rules, shared by the API and tests.

export const MAX_PROOF_IMAGE_BYTES = 2 * 1024 * 1024;
// Two images plus form fields, kept under Vercel's 4.5 MB request body limit.
export const MAX_PROOF_REQUEST_BYTES = 4_400_000;

export type ProofImageType = "image/jpeg" | "image/png" | "image/webp";
export type ProofKind = "photo" | "signature";

export const PROOF_KINDS = ["photo", "signature"] as const;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

// The declared MIME type comes from the client, so the type is read from the bytes.
export function detectImageType(bytes: Uint8Array): ProofImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

export class ProofImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofImageError";
  }
}

// APP1 holds EXIF (GPS, device, time) and XMP; APP13 holds IPTC; COM holds free text.
const JPEG_METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]);

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!startsWith(bytes, [0xff, 0xd8])) throw new ProofImageError("Not a JPEG image");
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new ProofImageError("Malformed JPEG image");
    let marker = bytes[offset + 1];
    let markerStart = offset;
    // Fill bytes (0xFF padding) may precede a marker.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      markerStart = offset;
      marker = bytes[offset + 1];
    }
    if (marker === undefined) throw new ProofImageError("Malformed JPEG image");
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(markerStart, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(markerStart, offset + 2));
      break;
    }
    if (offset + 4 > bytes.length) throw new ProofImageError("Malformed JPEG image");
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) throw new ProofImageError("Malformed JPEG image");
    const segmentEnd = offset + 2 + length;
    // Start of scan: the compressed image data follows to the end of the file.
    if (marker === 0xda) {
      parts.push(bytes.subarray(markerStart));
      offset = bytes.length;
      break;
    }
    if (!JPEG_METADATA_MARKERS.has(marker)) parts.push(bytes.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }
  return concat(parts);
}

const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (detectImageType(bytes) !== "image/png") throw new ProofImageError("Not a PNG image");
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ProofImageError("Malformed PNG image");
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) throw new ProofImageError("Malformed PNG image");
  return concat(parts);
}

export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (detectImageType(bytes) !== "image/webp") throw new ProofImageError("Not a WebP image");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) throw new ProofImageError("Malformed WebP image");
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = bytes.slice(offset, Math.min(end, bytes.length));
      // VP8X flags announce EXIF (0x08) and XMP (0x04); clear them with the chunks.
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    offset = end;
  }
  if (!chunks.length) throw new ProofImageError("Malformed WebP image");
  const body = concat(chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

export interface CleanProofImage {
  data: Uint8Array;
  contentType: ProofImageType;
}

// Validates size and real type, then removes metadata such as GPS coordinates.
export function cleanProofImage(bytes: Uint8Array): CleanProofImage {
  if (!bytes.length) throw new ProofImageError("The image is empty");
  if (bytes.length > MAX_PROOF_IMAGE_BYTES) throw new ProofImageError("Each image must be 2 MB or smaller");
  const contentType = detectImageType(bytes);
  if (!contentType) throw new ProofImageError("Use a JPEG, PNG or WebP image");
  const data =
    contentType === "image/jpeg" ? stripJpegMetadata(bytes)
      : contentType === "image/png" ? stripPngMetadata(bytes)
        : stripWebpMetadata(bytes);
  return { data, contentType };
}

export interface ProofViewer {
  id: string;
  role: string;
}

// Admins see every proof, customers see their own shipment's, couriers the ones assigned to them.
export function canViewProof(viewer: ProofViewer, shipment: { customerId: string; courierId: string | null }) {
  if (viewer.role === "ADMIN") return true;
  if (viewer.role === "CUSTOMER") return shipment.customerId === viewer.id;
  if (viewer.role === "COURIER") return shipment.courierId === viewer.id;
  return false;
}

const MAX_CAPTURE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// Offline captures upload later, so the device time is kept within sane bounds.
export function resolveCapturedAt(value: string | null | undefined, now: Date) {
  if (!value) return now;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return now;
  if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return now;
  if (now.getTime() - at.getTime() > MAX_CAPTURE_AGE_MS) return now;
  return at;
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface DeliveryProofSummary {
  recipientName: string;
  capturedAt: string;
  hasPhoto: boolean;
  hasSignature: boolean;
}

// Storage keys stay on the server; clients load images through the authorised route.
export function proofSummary(proof: { recipientName: string; capturedAt: Date; photoKey: string | null; signatureKey: string | null }): DeliveryProofSummary {
  return {
    recipientName: proof.recipientName,
    capturedAt: proof.capturedAt.toISOString(),
    hasPhoto: Boolean(proof.photoKey),
    hasSignature: Boolean(proof.signatureKey),
  };
}
