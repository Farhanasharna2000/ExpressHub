import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const { formatCount, parseCountTarget } = await import("../lib/count-up.ts");

test("figures split into prefix, number and suffix", () => {
  assert.deepEqual(parseCountTarget("99.98%"), { prefix: "", value: 99.98, decimals: 2, grouped: false, suffix: "%" });
  assert.deepEqual(parseCountTarget("<250ms"), { prefix: "<", value: 250, decimals: 0, grouped: false, suffix: "ms" });
  assert.deepEqual(parseCountTarget("BDT 1,234.50"), { prefix: "BDT ", value: 1234.5, decimals: 2, grouped: true, suffix: "" });
  assert.deepEqual(parseCountTarget(" 29+ "), { prefix: "", value: 29, decimals: 0, grouped: false, suffix: "+" });
});

test("text that is not a single figure is left alone", () => {
  for (const text of ["", "N/A", "12 of 30", "1.2.3", "—"]) assert.equal(parseCountTarget(text), null, text);
});

test("the final frame reproduces the rendered text exactly", () => {
  for (const text of ["99.98%", "<250ms", "BDT 1,234.50", "29+", "13", "BDT 1,000,000", "0.5h", "72.0%"]) {
    const target = parseCountTarget(text);
    assert.equal(formatCount(target, target.value), text, text);
  }
});

test("intermediate frames keep decimals and grouping and never overshoot", () => {
  const target = parseCountTarget("BDT 12,345.60");
  assert.equal(formatCount(target, 0), "BDT 0.00");
  assert.equal(formatCount(target, 1234.5), "BDT 1,234.50");
  assert.equal(formatCount(target, 99999), "BDT 12,345.60");
  assert.equal(formatCount(target, -3), "BDT 0.00");
});
