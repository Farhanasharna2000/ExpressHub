import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { Locale } from "@/lib/i18n/config";
import { prepareBengaliShaping, shapeBengali } from "@/lib/labels/bengali-shaper";

// 4 x 6 inch thermal label, in PDF points (72 per inch).
export const LABEL_WIDTH = 288;
export const LABEL_HEIGHT = 432;
const MARGIN = 16;
const CONTENT_WIDTH = LABEL_WIDTH - MARGIN * 2;
const INK = rgb(0.09, 0.22, 0.18);
const MUTED = rgb(0.35, 0.42, 0.39);

export interface LabelParty {
  name: string;
  phone: string;
  address: string;
}

export interface ShippingLabelData {
  trackingNumber: string;
  trackingUrl: string;
  sender: LabelParty;
  recipient: LabelParty;
  weightKg: string;
  bookedAt: Date;
  originHub: string | null;
  destinationHub: string | null;
}

const TYPOGRAPHY: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " ",
};

// Bengali block plus the joiners and dandas that appear inside Bangla text.
const BENGALI = /[\u0980-\u09ff\u200c\u200d\u0964\u0965]/u;
// Marks that must stay attached to the letter before them: never wrap or cut between them.
const COMBINING = /[\u0981-\u0983\u09bc\u09be-\u09cd\u09d7\u09e2\u09e3\u200c\u200d]/u;
const VIRAMA = "\u09cd";

export const isBengali = (char: string) => BENGALI.test(char);

// Latin text uses the standard PDF fonts (WinAnsi) and Bangla uses the embedded Noto Sans Bengali.
// Any other script would make pdf-lib throw, so it is shown as "?" instead of breaking the label.
export function labelSafeText(value: string) {
  return [...value.replace(/\s+/g, " ").trim()]
    .map((char) => {
      if (TYPOGRAPHY[char]) return TYPOGRAPHY[char];
      const code = char.codePointAt(0) ?? 0;
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || isBengali(char) ? char : "?";
    })
    .join("");
}

// Splits text into runs of the same script so each run is drawn with its own font.
export function scriptRuns(value: string) {
  const runs: { text: string; bengali: boolean }[] = [];
  for (const char of value) {
    const bengali = isBengali(char);
    const last = runs.at(-1);
    if (last && last.bengali === bengali) last.text += char;
    else runs.push({ text: char, bengali });
  }
  return runs;
}

type Measure = (text: string) => number;

// Greedy word wrap within maxWidth. Words longer than a line are split; text beyond
// maxLines is cut and the last line ends with "...".
export function wrapLabelText(text: string, measure: Measure, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  const push = (value: string) => { lines.push(value); line = ""; };
  for (const word of labelSafeText(text).split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) push(line);
    let rest = word;
    while (measure(rest) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
      // Never separate a letter from its vowel sign, or a conjunct from its next consonant.
      while (cut > 1 && (COMBINING.test(rest[cut] ?? "") || rest[cut - 1] === VIRAMA)) cut--;
      push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]}...`;
  while (last.length > 3 && measure(last) > maxWidth) last = `${last.slice(0, -4)}...`;
  kept[maxLines - 1] = last;
  return kept;
}

export function labelDate(value: Date, locale: Locale = "en") {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(value);
}

export function labelFileName(trackingNumber: string) {
  return `expresshub-label-${trackingNumber.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

// Fixed wording printed on the label. Tracking numbers, phones and the QR code stay Latin.
export const LABEL_COPY: Record<Locale, {
  deliverTo: string; from: string; booked: (date: string) => string; scan: string;
  weight: (kg: string) => string; route: (from: string, to: string) => string; unassigned: string;
}> = {
  en: {
    deliverTo: "DELIVER TO", from: "FROM", booked: (date) => `Booked ${date}`, scan: "Scan the QR code to track this parcel",
    weight: (kg) => `Weight ${kg} kg`, route: (from, to) => `${from} to ${to}`, unassigned: "Hub to be assigned",
  },
  bn: {
    deliverTo: "প্রাপক", from: "প্রেরক", booked: (date) => `বুকিং ${date}`, scan: "পার্সেল ট্র্যাক করতে QR কোড স্ক্যান করুন",
    weight: (kg) => `ওজন ${kg} কেজি`, route: (from, to) => `${from} থেকে ${to}`, unassigned: "হাব নির্ধারণ করা হবে",
  },
};

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };
type Weight = "regular" | "bold";

// Latin runs use the standard PDF fonts; Bangla runs are shaped by HarfBuzz. Widths are summed run by
// run, so wrapping and centring match what is drawn.
function widthOf(fonts: Fonts, weight: Weight, value: string, size: number) {
  const latin = weight === "bold" ? fonts.bold : fonts.regular;
  return scriptRuns(labelSafeText(value)).reduce(
    (sum, run) => sum + (run.bengali ? shapeBengali(run.text, weight).width(size) : latin.widthOfTextAtSize(run.text, size)),
    0,
  );
}

function text(page: PDFPage, fonts: Fonts, value: string, x: number, y: number, weight: Weight, size: number, color = INK) {
  const latin = weight === "bold" ? fonts.bold : fonts.regular;
  let cursor = x;
  for (const run of scriptRuns(labelSafeText(value))) {
    if (!run.bengali) {
      page.drawText(run.text, { x: cursor, y, font: latin, size, color });
      cursor += latin.widthOfTextAtSize(run.text, size);
      continue;
    }
    const shaped = shapeBengali(run.text, weight);
    const scale = shaped.scale(size);
    for (const glyph of shaped.glyphs) {
      if (glyph.path) page.drawSvgPath(glyph.path, { x: cursor + glyph.dx * scale, y: y + glyph.dy * scale, scale, color, borderWidth: 0 });
      cursor += glyph.advance * scale;
    }
  }
}

// Draws one party block and returns the y below it.
function party(page: PDFPage, fonts: Fonts, heading: string, who: LabelParty, x: number, top: number, width: number, large: boolean) {
  const nameSize = large ? 14 : 10;
  const bodySize = large ? 10 : 8.5;
  let y = top;
  text(page, fonts, heading, x, y, "bold", 7.5, MUTED);
  y -= nameSize + 4;
  for (const line of wrapLabelText(who.name, (t) => widthOf(fonts, "bold", t, nameSize), width, 1)) {
    text(page, fonts, line, x, y, "bold", nameSize);
  }
  y -= bodySize + 4;
  text(page, fonts, who.phone, x, y, "regular", bodySize);
  for (const line of wrapLabelText(who.address, (t) => widthOf(fonts, "regular", t, bodySize), width, large ? 3 : 4)) {
    y -= bodySize + 3;
    text(page, fonts, line, x, y, "regular", bodySize);
  }
  return y;
}

export interface LabelShipment {
  trackingNumber: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupAddress: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  deliveryAddress: string;
  parcelWeightKg: { toString(): string };
  createdAt: Date;
  originHub: { name: string } | null;
  destinationHub: { name: string } | null;
}

// The QR code holds the public tracking link, so anyone who scans it (courier or recipient)
// lands on the tracking page; the courier scanner reads the tracking number out of it.
export function publicTrackingUrl(appBaseUrl: string, trackingNumber: string) {
  return `${appBaseUrl.replace(/\/+$/, "")}/track/${encodeURIComponent(trackingNumber)}`;
}

export function shippingLabelData(shipment: LabelShipment, appBaseUrl: string): ShippingLabelData {
  return {
    trackingNumber: shipment.trackingNumber,
    trackingUrl: publicTrackingUrl(appBaseUrl, shipment.trackingNumber),
    sender: { name: shipment.pickupContactName, phone: shipment.pickupContactPhone, address: shipment.pickupAddress },
    recipient: { name: shipment.deliveryContactName, phone: shipment.deliveryContactPhone, address: shipment.deliveryAddress },
    weightKg: shipment.parcelWeightKg.toString(),
    bookedAt: shipment.createdAt,
    originHub: shipment.originHub?.name ?? null,
    destinationHub: shipment.destinationHub?.name ?? null,
  };
}

export function labelQrMatrix(value: string) {
  const code = QRCode.create(value, { errorCorrectionLevel: "M" });
  return { size: code.modules.size, dark: (row: number, col: number) => Boolean(code.modules.get(row, col)) };
}

// Draws the QR modules as filled squares, so the code stays sharp at any print size.
function qr(page: PDFPage, value: string, x: number, y: number, size: number) {
  const code = labelQrMatrix(value);
  const count = code.size;
  const quiet = 2;
  const cell = size / (count + quiet * 2);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!code.dark(row, col)) continue;
      page.drawRectangle({
        x: x + (col + quiet) * cell,
        y: y + size - (row + quiet + 1) * cell,
        width: cell,
        height: cell,
        color: rgb(0, 0, 0),
      });
    }
  }
}

export async function renderShippingLabel(data: ShippingLabelData, locale: Locale = "en"): Promise<Uint8Array> {
  const copy = LABEL_COPY[locale];
  await prepareBengaliShaping();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ExpressHub label ${data.trackingNumber}`);
  pdf.setProducer("ExpressHub");
  pdf.setCreator("ExpressHub");
  const page = pdf.addPage([LABEL_WIDTH, LABEL_HEIGHT]);
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  };
  const rule = (y: number) => page.drawLine({ start: { x: MARGIN, y }, end: { x: LABEL_WIDTH - MARGIN, y }, thickness: 1, color: INK });

  // Header
  let y = LABEL_HEIGHT - MARGIN - 14;
  text(page, fonts, "ExpressHub", MARGIN, y, "bold", 16);
  const booked = copy.booked(labelDate(data.bookedAt, locale));
  text(page, fonts, booked, LABEL_WIDTH - MARGIN - widthOf(fonts, "regular", booked, 8), y + 4, "regular", 8, MUTED);
  y -= 10;
  rule(y);

  // Recipient first: it is what the courier reads at the door.
  y = party(page, fonts, copy.deliverTo, data.recipient, MARGIN, y - 16, CONTENT_WIDTH, true) - 12;
  rule(y);

  // QR code beside the sender.
  const qrSize = 116;
  const qrTop = y - 8;
  qr(page, data.trackingUrl, MARGIN - 4, qrTop - qrSize, qrSize);
  const fromX = MARGIN + qrSize + 6;
  party(page, fonts, copy.from, data.sender, fromX, qrTop - 12, LABEL_WIDTH - MARGIN - fromX, false);
  y = qrTop - qrSize - 6;

  // Tracking number, sized to fit the full width.
  let monoSize = 14;
  while (monoSize > 8 && fonts.mono.widthOfTextAtSize(data.trackingNumber, monoSize) > CONTENT_WIDTH) monoSize -= 0.5;
  const trackingWidth = fonts.mono.widthOfTextAtSize(data.trackingNumber, monoSize);
  y -= monoSize;
  page.drawText(data.trackingNumber, { x: (LABEL_WIDTH - trackingWidth) / 2, y, font: fonts.mono, size: monoSize, color: INK });
  y -= 12;
  text(page, fonts, copy.scan, (LABEL_WIDTH - widthOf(fonts, "regular", copy.scan, 7.5)) / 2, y, "regular", 7.5, MUTED);
  y -= 10;
  rule(y);

  // Footer facts.
  const route = data.originHub || data.destinationHub ? copy.route(data.originHub ?? "-", data.destinationHub ?? "-") : copy.unassigned;
  const facts = [copy.weight(data.weightKg), route];
  y -= 14;
  for (const fact of facts) {
    for (const line of wrapLabelText(fact, (t) => widthOf(fonts, "bold", t, 9), CONTENT_WIDTH, 1)) text(page, fonts, line, MARGIN, y, "bold", 9);
    y -= 13;
  }

  return pdf.save();
}
