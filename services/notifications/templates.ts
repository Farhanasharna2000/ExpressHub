import type { NotificationType } from "@prisma/client";

export interface NotificationContent {
  recipientName: string;
  trackingNumber: string;
  trackingUrl: string;
  occurredAt: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const COPY: Record<NotificationType, { subject: string; heading: string; body: string }> = {
  SHIPMENT_BOOKED: {
    subject: "Your shipment is booked",
    heading: "Shipment booked",
    body: "We have received your booking. We will let you know when a courier picks it up.",
  },
  SHIPMENT_PICKED_UP: {
    subject: "Your shipment has been picked up",
    heading: "Picked up",
    body: "A courier has collected your parcel and it is on its way through our network.",
  },
  SHIPMENT_OUT_FOR_DELIVERY: {
    subject: "Your shipment is out for delivery",
    heading: "Out for delivery",
    body: "Your parcel is with the courier and should arrive today.",
  },
  SHIPMENT_DELIVERED: {
    subject: "Your shipment has been delivered",
    heading: "Delivered",
    body: "Your parcel has been delivered. Thank you for shipping with ExpressHub.",
  },
  SHIPMENT_FAILED: {
    subject: "We could not deliver your shipment",
    heading: "Delivery attempt failed",
    body: "The courier could not complete the delivery. Our team will arrange the next attempt or a return.",
  },
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

// Names come from user input; keep them on one line and short so they can't
// reshape the email or the subject.
function plainName(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80) || "there";
}

function dhakaTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(value);
}

export function renderNotification(type: NotificationType, content: NotificationContent): RenderedEmail {
  const copy = COPY[type];
  const name = plainName(content.recipientName);
  const when = dhakaTime(content.occurredAt);
  const subject = `${copy.subject} (${content.trackingNumber})`;
  const text = [
    `Hi ${name},`,
    "",
    copy.body,
    "",
    `Tracking number: ${content.trackingNumber}`,
    `Updated: ${when} (Bangladesh time)`,
    `Track your parcel: ${content.trackingUrl}`,
    "",
    "You can turn off these emails in your ExpressHub profile.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1d23;">
  <main style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(copy.heading)}</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">${escapeHtml(copy.body)}</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 4px;">Tracking number: <strong>${escapeHtml(content.trackingNumber)}</strong></p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 20px;">Updated: ${escapeHtml(when)} (Bangladesh time)</p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(content.trackingUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:16px;">Track your parcel</a></p>
    <p style="font-size:12px;line-height:1.5;color:#4b5563;margin:0;">You can turn off these emails in your ExpressHub profile.</p>
  </main>
</body>
</html>`;
  return { subject, html, text };
}
