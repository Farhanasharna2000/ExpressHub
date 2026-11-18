// Pure helpers for count-up animations: split a rendered figure such as "BDT 1,234.50",
// "99.98%" or "<250ms" into prefix, number and suffix, and rebuild it at any value with
// the same decimals and digit grouping, so an animation always ends on the exact text.

export type CountTarget = {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
};

const FIGURE = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\D*)$/;

export function parseCountTarget(text: string): CountTarget | null {
  const match = FIGURE.exec(text.trim());
  if (!match) return null;
  const [, prefix, whole, fraction = "", suffix] = match;
  const value = Number(`${whole.replaceAll(",", "")}${fraction ? `.${fraction}` : ""}`);
  if (!Number.isFinite(value)) return null;
  return { prefix, value, decimals: fraction.length, grouped: whole.includes(","), suffix };
}

export function formatCount(target: CountTarget, current: number) {
  const clamped = Math.min(Math.max(current, 0), target.value);
  const fixed = clamped.toFixed(target.decimals);
  const [whole, fraction] = fixed.split(".");
  const digits = target.grouped ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${target.prefix}${digits}${fraction ? `.${fraction}` : ""}${target.suffix}`;
}
