import { Prisma, type PricingRule } from "@prisma/client";
import { AppError } from "@/lib/http/errors";

export type QuoteRule = Pick<PricingRule, "id" | "minWeightKg" | "maxWeightKg" | "baseFee" | "additionalPerKgFee" | "currency">;

const unavailable = (message: string) => new AppError(503, message, "PRICING_UNAVAILABLE");

// The price of one parcel under one rule: the base fee plus the per-kilo fee for every
// started kilo above the rule's minimum. Booking and the CSV import preview share this,
// so the price a customer is shown is the price they are charged.
export function quoteWithRule(rule: QuoteRule, weight: Prisma.Decimal) {
  const extraKg = Prisma.Decimal.max(weight.minus(rule.minWeightKg), 0).ceil();
  const price = rule.baseFee.plus(extraKg.times(rule.additionalPerKgFee)).toDecimalPlaces(2);
  if (
    rule.baseFee.isNegative() ||
    rule.additionalPerKgFee.isNegative() ||
    price.lte(0) ||
    price.gt("9999999999.99") ||
    !/^[A-Z]{3}$/.test(rule.currency)
  ) {
    throw unavailable("Pricing rule is invalid");
  }
  return { rule, price, currency: rule.currency };
}

// Exactly one active rule must cover the weight; zero or several is a configuration problem.
export function quoteWithRules(rules: readonly QuoteRule[], weight: Prisma.Decimal) {
  const matching = rules.filter((rule) => rule.minWeightKg.lte(weight) && rule.maxWeightKg.gte(weight));
  if (matching.length !== 1) throw unavailable("A unique active pricing rule is required for this weight");
  return quoteWithRule(matching[0], weight);
}
