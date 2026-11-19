import type { RenderedEmail } from "@/services/notifications/templates";

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  // The outbox row id, sent as a custom header so a delivery can be traced in Brevo.
  idempotencyKey: string;
}

export interface NotificationSender {
  name: string;
  send(email: OutgoingEmail): Promise<void>;
}

export class PermanentSendError extends Error {}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

// RFC 2606/6761 reserved names never receive mail. Tests and seeds use them, so a real
// Brevo key in .env never spends quota or sender reputation on them.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;
export const isUndeliverableTestAddress = (address: string) => RESERVED_DOMAIN.test(address.split("@").pop() ?? "");

// "ExpressHub <notifications@gmail.com>" or a bare address.
export function parseSender(from: string) {
  const match = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (match) return { name: match[1].replace(/^"|"$/g, "") || undefined, email: match[2] };
  return { name: undefined, email: from.trim() };
}

// 4xx other than rate limiting will not succeed on retry (bad address, unverified sender,
// wrong key), so those go straight to the admin's failed-email list.
async function failure(response: Response): Promise<never> {
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  const message = `Brevo ${response.status}: ${detail}`;
  if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new PermanentSendError(message);
  throw new Error(message);
}

function skipTestAddress(email: OutgoingEmail) {
  if (!isUndeliverableTestAddress(email.to)) return false;
  console.info(`[notifications] skipped reserved test address for "${email.subject}"`);
  return true;
}

// Brevo sends from a single verified sender address, so no domain is needed. Its API has
// no idempotency key; the outbox's lease and SENT marking keep normal retries to one send.
export function brevoSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): NotificationSender {
  const sender = parseSender(from);
  return {
    name: "brevo",
    async send(email) {
      if (skipTestAddress(email)) return;
      const response = await fetchImpl(BREVO_URL, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          headers: { "X-ExpressHub-Notification": email.idempotencyKey },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (response.ok) return;
      await failure(response);
    },
  };
}

// Used when no provider is configured: logs that an email would be sent without its contents.
export function consoleSender(log: (message: string) => void = console.info): NotificationSender {
  return {
    name: "console",
    async send(email) {
      const [user, domain] = email.to.split("@");
      log(`[notifications] would send "${email.subject}" to ${user.slice(0, 2)}***@${domain ?? ""}`);
    },
  };
}

export function configuredSender(env: Record<string, string | undefined> = process.env): NotificationSender {
  const apiKey = env.BREVO_API_KEY?.trim();
  const from = env.NOTIFICATIONS_FROM?.trim();
  if (apiKey && from) return brevoSender(apiKey, from);
  if (apiKey && !from) console.warn("BREVO_API_KEY is set without NOTIFICATIONS_FROM; emails are only logged");
  return consoleSender();
}
