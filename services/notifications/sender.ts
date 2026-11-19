import type { RenderedEmail } from "@/services/notifications/templates";

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  // Lets the provider drop a duplicate if a send is retried after an unclear result.
  idempotencyKey: string;
}

export interface NotificationSender {
  name: string;
  send(email: OutgoingEmail): Promise<void>;
}

export class PermanentSendError extends Error {}

const RESEND_URL = "https://api.resend.com/emails";
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

// RFC 2606/6761 reserved names never receive mail. Tests and seeds use them, so a real
// provider key in .env never spends quota or sender reputation on them.
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
async function failure(provider: string, response: Response): Promise<never> {
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  const message = `${provider} ${response.status}: ${detail}`;
  if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new PermanentSendError(message);
  throw new Error(message);
}

function skipTestAddress(provider: string, email: OutgoingEmail) {
  if (!isUndeliverableTestAddress(email.to)) return false;
  console.info(`[notifications] ${provider}: skipped reserved test address for "${email.subject}"`);
  return true;
}

export function resendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): NotificationSender {
  return {
    name: "resend",
    async send(email) {
      if (skipTestAddress("resend", email)) return;
      const response = await fetchImpl(RESEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": email.idempotencyKey,
        },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (response.ok) return;
      await failure("Resend", response);
    },
  };
}

// Brevo sends from a single verified sender address, so no domain is needed. Its API has
// no idempotency key; the outbox's lease and SENT marking keep normal retries to one send.
export function brevoSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): NotificationSender {
  const sender = parseSender(from);
  return {
    name: "brevo",
    async send(email) {
      if (skipTestAddress("brevo", email)) return;
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
      await failure("Brevo", response);
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
  const from = env.NOTIFICATIONS_FROM?.trim();
  const brevoKey = env.BREVO_API_KEY?.trim();
  const resendKey = env.RESEND_API_KEY?.trim();
  // EMAIL_PROVIDER picks one explicitly; otherwise Brevo wins when its key is set.
  const choice = env.EMAIL_PROVIDER?.trim().toLowerCase() || (brevoKey ? "brevo" : resendKey ? "resend" : "");
  const key = choice === "brevo" ? brevoKey : choice === "resend" ? resendKey : undefined;
  if (choice && !["brevo", "resend"].includes(choice)) {
    console.warn(`EMAIL_PROVIDER "${choice}" is not supported (use brevo or resend); emails are only logged`);
  } else if (choice && (!key || !from)) {
    console.warn(`${choice} needs its API key and NOTIFICATIONS_FROM; emails are only logged`);
  } else if (choice === "brevo") {
    return brevoSender(key!, from!);
  } else if (choice === "resend") {
    return resendSender(key!, from!);
  }
  return consoleSender();
}
