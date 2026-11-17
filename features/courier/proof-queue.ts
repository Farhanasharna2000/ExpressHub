import { ApiError, type ApiClient } from "@/lib/client/api";

// A delivery captured at the door: proof first, then the DELIVERED status change.
export interface PendingDelivery {
  id: string;
  // The courier who captured it; another account on the same phone never sends it.
  courierId: string;
  shipmentId: string;
  trackingNumber: string;
  recipientName: string;
  note?: string;
  capturedAt: string;
  photo?: Blob;
  signature?: Blob;
  attempts: number;
  lastError?: string;
  failed?: boolean;
}

export type DeliveryOutcome = "delivered" | "retry" | "failed";

const errorCode = (error: ApiError) => {
  const first = error.errors[0];
  return first && typeof first === "object" && "code" in first ? String(first.code) : undefined;
};

// Connection problems, rate limits and server errors are worth retrying later;
// validation or permission errors are not.
export function isRetryable(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

async function alreadyDelivered(api: ApiClient, shipmentId: string) {
  const result = await api.request<{ shipment: { status: string } }>(`/shipments/${encodeURIComponent(shipmentId)}`);
  return result.shipment.status === "DELIVERED";
}

// Safe to repeat: a delivery finished by an earlier attempt or another device counts as done.
export async function submitDelivery(api: ApiClient, item: PendingDelivery): Promise<void> {
  const path = `/shipments/${encodeURIComponent(item.shipmentId)}`;
  const form = new FormData();
  form.set("recipientName", item.recipientName);
  form.set("capturedAt", item.capturedAt);
  if (item.photo) form.set("photo", item.photo, "photo");
  if (item.signature) form.set("signature", item.signature, "signature");
  try {
    await api.request(`${path}/proof`, { method: "POST", body: form });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && errorCode(error) === "PROOF_NOT_ALLOWED" && (await alreadyDelivered(api, item.shipmentId))) return;
    throw error;
  }
  try {
    await api.request(`${path}/status`, {
      method: "PATCH",
      body: { status: "DELIVERED", expectedStatus: "OUT_FOR_DELIVERY", note: item.note && item.note.trim().length >= 3 ? item.note.trim() : `Delivered to ${item.recipientName}` },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && (await alreadyDelivered(api, item.shipmentId))) return;
    throw error;
  }
}

export async function attemptDelivery(api: ApiClient, item: PendingDelivery): Promise<{ outcome: DeliveryOutcome; error?: unknown }> {
  try {
    await submitDelivery(api, item);
    return { outcome: "delivered" };
  } catch (error) {
    return { outcome: isRetryable(error) ? "retry" : "failed", error };
  }
}

// IndexedDB keeps captured proofs (including the image blobs) across reloads and app restarts.
const DB_NAME = "expresshub-courier";
const STORE = "pending-deliveries";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const deliveryQueue = {
  supported: () => typeof indexedDB !== "undefined",
  async list(): Promise<PendingDelivery[]> {
    if (!deliveryQueue.supported()) return [];
    const items = await withStore<PendingDelivery[]>("readonly", (store) => store.getAll() as IDBRequest<PendingDelivery[]>);
    return items.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  },
  async put(item: PendingDelivery) {
    await withStore("readwrite", (store) => store.put(item));
    notifyQueueChanged();
  },
  async remove(id: string) {
    await withStore("readwrite", (store) => store.delete(id));
    notifyQueueChanged();
  },
};

export const QUEUE_EVENT = "expresshub:delivery-queue";

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

let flushing: Promise<void> | null = null;

// Sends every waiting delivery once. Runs one flush at a time across the page.
export function flushDeliveryQueue(api: ApiClient, courierId: string): Promise<void> {
  flushing ??= (async () => {
    try {
      for (const item of await deliveryQueue.list()) {
        if (item.failed || item.courierId !== courierId) continue;
        const { outcome, error } = await attemptDelivery(api, item);
        if (outcome === "delivered") await deliveryQueue.remove(item.id);
        else await deliveryQueue.put({ ...item, attempts: item.attempts + 1, failed: outcome === "failed", lastError: error instanceof Error ? error.message : undefined });
        if (outcome === "retry") break;
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
