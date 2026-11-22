import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import jsQR from "jsqr";

const {
  LABEL_COPY, LABEL_HEIGHT, isBengali, scriptRuns, LABEL_WIDTH, labelDate, labelFileName, labelQrMatrix, labelSafeText, publicTrackingUrl,
  renderShippingLabel, shippingLabelData, wrapLabelText,
} = await import("../lib/labels/shipping-label.ts");
const { courierLookupPath, trackingNumberFromScan } = await import("../features/courier/scan-contracts.ts");

const TRACK = "EH-0123456789ABCDEF01234567";
const shipment = {
  trackingNumber: TRACK,
  pickupContactName: "Rina Akter",
  pickupContactPhone: "01700000000",
  pickupAddress: "House 12, Road 5, Gulshan 1, Dhaka",
  deliveryContactName: "Rahim Uddin",
  deliveryContactPhone: "01800000000",
  deliveryAddress: "Agrabad Commercial Area, Chattogram",
  parcelWeightKg: { toString: () => "2.5" },
  createdAt: new Date("2026-11-16T03:30:00Z"),
  originHub: { name: "Dhaka Hub" },
  destinationHub: null,
};

// Rasterises the QR matrix (with a white quiet zone) and decodes it like a phone camera would.
function decodeQr(value) {
  const { size, dark } = labelQrMatrix(value);
  const scale = 4;
  const quiet = 4;
  const width = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!dark(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset = (((row + quiet) * scale + dy) * width + (col + quiet) * scale + dx) * 4;
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
        }
      }
    }
  }
  return jsQR(pixels, width, width)?.data;
}

test("the label QR code decodes to the public tracking link, not private data", () => {
  const data = shippingLabelData(shipment, "https://expresshub.example/");
  assert.equal(data.trackingUrl, `https://expresshub.example/track/${TRACK}`);
  assert.equal(publicTrackingUrl("http://localhost:3000", TRACK), `http://localhost:3000/track/${TRACK}`);
  const decoded = decodeQr(data.trackingUrl);
  assert.equal(decoded, data.trackingUrl);
  assert.equal(trackingNumberFromScan(decoded), TRACK);
  for (const secret of [shipment.deliveryContactPhone, shipment.pickupAddress]) assert.equal(decoded.includes(secret), false);
});

test("label text is limited to what standard PDF fonts can draw", () => {
  assert.equal(labelSafeText("Rahim   Uddin\n"), "Rahim Uddin");
  assert.equal(labelSafeText("রহিম Uddin"), "রহিম Uddin");
  assert.equal(labelSafeText("日本 Uddin"), "?? Uddin");
  assert.equal(labelSafeText("Café “Dhaka” – 12…"), "Café \"Dhaka\" - 12...");
});

test("long text wraps within the width and is cut with an ellipsis", () => {
  const measure = (text) => text.length * 6;
  assert.deepEqual(wrapLabelText("House 12 Road 5", measure, 60, 3), ["House 12", "Road 5"]);
  const long = wrapLabelText("a very long delivery address that keeps going far past the space on the label", measure, 60, 2);
  assert.equal(long.length, 2);
  assert.ok(long[1].endsWith("..."));
  for (const line of long) assert.ok(measure(line) <= 60, line);
  // A single word wider than the line is split rather than overflowing.
  for (const line of wrapLabelText("X".repeat(25), measure, 60, 5)) assert.ok(measure(line) <= 60);
});

test("a 4x6 inch PDF label renders, including addresses it cannot fully draw", async () => {
  const pdf = await renderShippingLabel(shippingLabelData({ ...shipment, deliveryContactName: "রহিম উদ্দিন", deliveryAddress: "x".repeat(400) }, "http://localhost:3000"));
  const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
  assert.equal(head, "%PDF-");
  assert.ok(pdf.length > 1000);
  assert.deepEqual([LABEL_WIDTH, LABEL_HEIGHT], [288, 432]);
  assert.equal(labelDate(new Date("2026-11-16T18:30:00Z")), "17 Nov 2026");
  assert.equal(labelFileName(TRACK), `expresshub-label-${TRACK}.pdf`);
  assert.equal(labelFileName('EH-1"; x=y'), "expresshub-label-EH-1xy.pdf");
});

test("scans accept a tracking link or a bare number and nothing else", () => {
  assert.equal(trackingNumberFromScan(`https://expresshub.app/track/${TRACK}`), TRACK);
  assert.equal(trackingNumberFromScan(TRACK.toLowerCase()), TRACK);
  assert.equal(trackingNumberFromScan("https://evil.example/login"), null);
  assert.equal(trackingNumberFromScan(""), null);
  assert.equal(courierLookupPath(TRACK), `/courier/shipments/by-tracking/${TRACK}`);
});

test("Bangla is kept and split from Latin text into runs", () => {
  assert.equal(isBengali("র"), true);
  assert.equal(isBengali("R"), false);
  assert.deepEqual(scriptRuns("Flat 3, মিরপুর 10"), [
    { text: "Flat 3, ", bengali: false }, { text: "মিরপুর", bengali: true }, { text: " 10", bengali: false },
  ]);
});

test("wrapping a long Bangla word never separates a letter from its vowel sign or conjunct", () => {
  const measure = (text) => [...text].length * 6;
  const word = "বাংলাদেশের".repeat(4);
  for (const line of wrapLabelText(word, measure, 60, 10)) {
    assert.ok(!/^[\u09be-\u09cd\u0981-\u0983]/u.test(line), `starts with a combining mark: ${line}`);
    assert.ok(!line.endsWith("\u09cd"), `ends with a virama: ${line}`);
  }
});

test("a Bangla label renders with Bangla names, addresses and headings in an embedded font", async () => {
  const bangla = shippingLabelData({
    ...shipment,
    deliveryContactName: "রহিম উদ্দিন",
    deliveryAddress: "বাড়ি ১২, রোড ৫, গুলশান ১, ঢাকা",
    pickupContactName: "রিনা আক্তার",
    originHub: { name: "ঢাকা হাব" },
  }, "http://localhost:3000");
  const en = await renderShippingLabel(bangla, "en");
  const bn = await renderShippingLabel(bangla, "bn");
  for (const pdf of [en, bn]) assert.equal(Buffer.from(pdf.slice(0, 5)).toString("latin1"), "%PDF-");
  // Bangla is drawn as vector outlines, so no font file is embedded, and the fixed wording is translated.
  assert.equal(Buffer.from(bn).includes("NotoSansBengali"), false);
  assert.notDeepEqual(Buffer.from(en), Buffer.from(bn));
  assert.equal(LABEL_COPY.bn.deliverTo, "প্রাপক");
  assert.match(labelDate(new Date("2026-11-16T18:30:00Z"), "bn"), /^১৭ .*২০২৬$/u);
});
