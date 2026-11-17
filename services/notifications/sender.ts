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
const SEND_TIMEOUT_MS = 10_000;

export function resendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): NotificationSender {
  return {
    name: "resend",
    async send(email) {
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
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      // 4xx other than rate limiting will not succeed on retry (bad address, unverified sender).
      const message = `Resend ${response.status}: ${detail}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new PermanentSendError(message);
      throw new Error(message);
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
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFICATIONS_FROM?.trim();
  if (apiKey && from) return resendSender(apiKey, from);
  if (apiKey && !from) console.warn("RESEND_API_KEY is set without NOTIFICATIONS_FROM; emails are only logged");
  return consoleSender();
}
