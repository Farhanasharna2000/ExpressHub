// Turns the raw error stored on a failed email ("Brevo 401: {...}") into a short reason an
// admin can act on. The raw text stays available in the panel for anyone who needs it.
export type FailureReason =
  | "ipBlocked"
  | "badKey"
  | "senderNotVerified"
  | "badRecipient"
  | "quotaOrLimit"
  | "providerDown"
  | "network"
  | "unknown";

export function failureReason(lastError: string | null): FailureReason {
  if (!lastError) return "unknown";
  const text = lastError.toLowerCase();
  const status = /\bbrevo (\d{3})\b/.exec(text)?.[1];
  const code = status ? Number(status) : null;

  if (code === 401 || code === 403) return /ip|authori[sz]ed/.test(text) ? "ipBlocked" : "badKey";
  if (code === 429 || /quota|limit|credit/.test(text)) return "quotaOrLimit";
  if (code !== null && code >= 500) return "providerDown";
  if (code !== null && code >= 400) {
    if (/sender/.test(text)) return "senderNotVerified";
    if (/recipient|email|address|to\b/.test(text)) return "badRecipient";
    return "unknown";
  }
  if (/fetch failed|timeout|timed out|econn|enotfound|network|abort/.test(text)) return "network";
  return "unknown";
}
