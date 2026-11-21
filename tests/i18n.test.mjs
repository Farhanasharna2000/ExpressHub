import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"));
const bn = JSON.parse(readFileSync(new URL("../messages/bn.json", import.meta.url), "utf8"));
const format = await import("../lib/i18n/format.ts");
const tracking = await import("../features/tracking/contracts.ts");
const { findStrings, isProse } = await import("../scripts/check-hardcoded-strings.mjs");

function flatten(messages, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const enFlat = flatten(en);
const bnFlat = flatten(bn);

// Values that are correctly the same in both languages: names, codes, symbols and
// placeholders that only wrap another value.
const SAME_IN_BOTH = new Set([
  "language.en", // each language is named in its own script: "English", "বাংলা"
  "language.bn",
  "status.STRIPE", // product name
]);
const allowedIdentical = (key, value) =>
  SAME_IN_BOTH.has(key) || /^[\s\p{P}\p{S}\d]*$/u.test(value.replace(/\{[^}]*\}|<\/?\w+>/g, ""));

test("English and Bangla have exactly the same message keys", () => {
  const missing = Object.keys(enFlat).filter((key) => !(key in bnFlat));
  const extra = Object.keys(bnFlat).filter((key) => !(key in enFlat));
  assert.deepEqual(missing, [], "keys missing from bn.json");
  assert.deepEqual(extra, [], "keys only in bn.json");
  assert.ok(Object.keys(enFlat).length > 1500, "the whole interface is in the message files");
});

test("no message is empty, and Bangla never just repeats the English text", () => {
  for (const [key, value] of Object.entries(enFlat)) {
    assert.equal(typeof value, "string", key);
    assert.ok(value.trim(), `empty en value: ${key}`);
    assert.ok(bnFlat[key].trim(), `empty bn value: ${key}`);
    if (bnFlat[key] === value) assert.ok(allowedIdentical(key, value), `bn repeats English for ${key}: ${value}`);
  }
});

test("both languages use the same placeholders and rich-text tags", () => {
  const args = (text) => [...new Set([...text.matchAll(/\{([A-Za-z_]\w*)\s*[,}]/g), ...text.matchAll(/<\/?([A-Za-z]\w*)>/g)].map((m) => m[1]))].sort();
  for (const [key, value] of Object.entries(enFlat)) assert.deepEqual(args(bnFlat[key]), args(value), key);
});

test("Bangla text uses Bangla script and digits", () => {
  for (const [key, value] of Object.entries(bnFlat)) {
    const text = value.replace(/\{[^}]*\}|<\/?\w+>/g, "");
    if (/[A-Za-z]{4,}/.test(text) && !/[ঀ-৿]/.test(text)) assert.ok(allowedIdentical(key, enFlat[key]), `no Bangla in ${key}: ${value}`);
    assert.doesNotMatch(text.replace(/2xx|HMAC-SHA256|Node\.js|OpenAPI 3\.0/g, ""), /[0-9]/, `Latin digits in ${key}: ${value}`);
  }
});

const AT = "2026-11-19T04:19:00.000Z"; // 10:19 AM in Dhaka

test("Bangla dates, times and numbers use Bangla digits and words", () => {
  assert.equal(format.toBanglaDigits("2026-11-19 10:19"), "২০২৬-১১-১৯ ১০:১৯");
  assert.equal(format.fromBanglaDigits("৯৯.৯৮%"), "99.98%");
  assert.equal(format.formatClockDate(AT, "bn", "Asia/Dhaka"), "১৯ নভে ২০২৬, ১০:১৯ পূর্বাহ্ণ");
  assert.equal(format.formatClockDate("2026-11-19T10:05:00.000Z", "bn", "Asia/Dhaka"), "১৯ নভে ২০২৬, ৪:০৫ অপরাহ্ণ");
  assert.equal(format.formatDateTime(AT, "bn"), "১৯ নভে ২০২৬, ১০:১৯ পূর্বাহ্ণ");
  assert.equal(format.formatMoney("1250.00", "BDT", "bn"), "৳১২৫০.০০");
  assert.equal(format.formatNumber(1234567.5, "bn"), "১২,৩৪,৫৬৭.৫");
  assert.equal(format.formatPercent(0.873, "bn", 1), "৮৭.৩%");
  assert.equal(format.formatRelativeMinutes(7, "bn"), "৭ মিনিট আগে");
  assert.equal(tracking.trackingTime(AT, "Asia/Dhaka", "bn"), "১৯ নভে ২০২৬, ১০:১৯ পূর্বাহ্ণ");
  assert.equal(tracking.trackingShortTime(AT, "Asia/Dhaka", "bn"), "১৯ নভে, ১০:১৯ পূর্বাহ্ণ");
});

test("English output is unchanged by the Bangla support", () => {
  const legacy = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(AT));
  assert.equal(format.formatDateTime(AT, "en"), legacy);
  assert.equal(format.formatDateTime(AT), legacy);
  assert.equal(format.formatMoney("1250.00", "BDT", "en"), "BDT 1250.00");
  assert.equal(format.localizeDigits("99.98%", "en"), "99.98%");
  assert.equal(tracking.trackingTime(AT, "Asia/Dhaka"), tracking.trackingTime(AT, "Asia/Dhaka", "en"));
  assert.equal(tracking.trackingShortTime(AT, "Asia/Dhaka"), tracking.trackingShortTime(AT, "Asia/Dhaka", "en"));
});

test("the hardcoded string checker finds English UI text and ignores code", () => {
  const found = findStrings(`
    export function Card({ busy }) {
      return <section aria-label="Order summary" className="flex gap-2">
        <h2>Order summary</h2>
        <p>{busy ? "Saving…" : t("save")}</p>
        <code>shipments:read</code>
        <span>{"PENDING"}</span><a href="/help">{t("help")}</a>
      </section>;
    }`);
  assert.deepEqual(found.map((hit) => hit.text), ["Order summary", "Order summary", "Saving…"]);
  assert.equal(isProse("ExpressHub"), false);
  assert.equal(isProse("OUT_FOR_DELIVERY"), false);
  assert.equal(isProse("Track a parcel"), true);
});
