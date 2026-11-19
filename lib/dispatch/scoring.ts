// Rule-based courier ranking for dispatch suggestions. Pure functions only, so the
// scoring can be unit-tested and reused for the AI prompt and the rules fallback.

export type HubRef = { id: string; name: string; zoneCode: string };

export type DispatchShipment = {
  id: string;
  trackingNumber: string;
  status: string;
  weightKg: number;
  waitingHours: number;
  originHub: HubRef | null;
  destinationHub: HubRef | null;
};

export type CourierStats = {
  id: string;
  name: string;
  // Open assigned shipments (not delivered, returned or cancelled), of which on the road.
  openShipments: number;
  outForDelivery: number;
  // Hubs and zones seen on this courier's shipments in the last 30 days.
  recentHubIds: string[];
  recentZoneCodes: string[];
  liveLocation: boolean;
  delivered30d: number;
  failed30d: number;
};

export type HubMatch = "origin" | "destination" | "zone" | null;

export type CandidateFactors = {
  openShipments: number;
  outForDelivery: number;
  load: number;
  hubMatch: HubMatch;
  liveLocation: boolean;
  successRate: number | null;
  recentDeliveries: number;
};

export type ScoredCandidate = { courierId: string; name: string; score: number; factors: CandidateFactors };

// Points out of 100. Capacity matters most: a free courier can collect today.
export const DISPATCH_WEIGHTS = {
  capacity: 40, // full marks with no open work, falling to 0 at CAPACITY_LOAD
  area: 30, // origin hub 30, destination hub 20, same zone 15
  live: 15, // sharing a fresh live location, so reachable and on duty now
  reliability: 15, // delivered / (delivered + failed) over 30 days; neutral half marks without history
} as const;
export const CAPACITY_LOAD = 8;
// A shipment out for delivery keeps the courier on the road, so it counts 1.5x.
export const OUT_FOR_DELIVERY_WEIGHT = 1.5;
export const MAX_SUGGESTIONS = 3;
export const MAX_AI_CANDIDATES = 8;

const round = (value: number) => Math.round(value * 10) / 10;

export function hubMatchFor(shipment: Pick<DispatchShipment, "originHub" | "destinationHub">, courier: Pick<CourierStats, "recentHubIds" | "recentZoneCodes">): HubMatch {
  const hubs = new Set(courier.recentHubIds);
  if (shipment.originHub && hubs.has(shipment.originHub.id)) return "origin";
  if (shipment.destinationHub && hubs.has(shipment.destinationHub.id)) return "destination";
  const zones = new Set(courier.recentZoneCodes);
  const shipmentZones = [shipment.originHub?.zoneCode, shipment.destinationHub?.zoneCode].filter(Boolean);
  return shipmentZones.some((zone) => zones.has(zone!)) ? "zone" : null;
}

const AREA_POINTS: Record<Exclude<HubMatch, null>, number> = { origin: 30, destination: 20, zone: 15 };

export function factorsFor(shipment: DispatchShipment, courier: CourierStats): CandidateFactors {
  const waiting = Math.max(0, courier.openShipments - courier.outForDelivery);
  const load = round(waiting + courier.outForDelivery * OUT_FOR_DELIVERY_WEIGHT);
  const finished = courier.delivered30d + courier.failed30d;
  return {
    openShipments: courier.openShipments,
    outForDelivery: courier.outForDelivery,
    load,
    hubMatch: hubMatchFor(shipment, courier),
    liveLocation: courier.liveLocation,
    successRate: finished > 0 ? courier.delivered30d / finished : null,
    recentDeliveries: courier.delivered30d,
  };
}

export function scoreFactors(factors: CandidateFactors) {
  const capacity = DISPATCH_WEIGHTS.capacity * Math.max(0, 1 - factors.load / CAPACITY_LOAD);
  const area = factors.hubMatch ? AREA_POINTS[factors.hubMatch] : 0;
  const live = factors.liveLocation ? DISPATCH_WEIGHTS.live : 0;
  const reliability = DISPATCH_WEIGHTS.reliability * (factors.successRate ?? 0.5);
  return round(capacity + area + live + reliability);
}

// Highest score first; ties go to the lighter load, then more recent deliveries, then id,
// so the same data always produces the same order.
export function rankCouriers(shipment: DispatchShipment, couriers: CourierStats[]): ScoredCandidate[] {
  return couriers
    .map((courier) => {
      const factors = factorsFor(shipment, courier);
      return { courierId: courier.id, name: courier.name, score: scoreFactors(factors), factors };
    })
    .sort((a, b) =>
      b.score - a.score
      || a.factors.load - b.factors.load
      || b.factors.recentDeliveries - a.factors.recentDeliveries
      || (a.courierId < b.courierId ? -1 : a.courierId > b.courierId ? 1 : 0));
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// A short, factual reason built only from the factors, used when AI is off or fails.
export function rulesReason(factors: CandidateFactors, shipment: Pick<DispatchShipment, "originHub" | "destinationHub">) {
  const parts = [factors.openShipments === 0 ? "No open shipments" : `${plural(factors.openShipments, "open shipment")}`];
  if (factors.hubMatch === "origin" && shipment.originHub) parts.push(`works the ${shipment.originHub.name} hub`);
  else if (factors.hubMatch === "destination" && shipment.destinationHub) parts.push(`delivers to the ${shipment.destinationHub.name} hub`);
  else if (factors.hubMatch === "zone") parts.push("works in the same zone");
  if (factors.liveLocation) parts.push("sharing a live location");
  if (factors.successRate !== null) parts.push(`${Math.round(factors.successRate * 100)}% delivered in 30 days`);
  return parts.join(" · ");
}

// What the model sees: labels C1..Cn and numbers only, never names, emails or phones.
export function pseudonymize(shipment: DispatchShipment, candidates: ScoredCandidate[]) {
  const labelled = candidates.slice(0, MAX_AI_CANDIDATES).map((candidate, index) => ({ label: `C${index + 1}`, candidate }));
  const prompt = {
    shipment: {
      status: shipment.status,
      weightKg: shipment.weightKg,
      waitingHours: shipment.waitingHours,
      originHub: shipment.originHub?.name ?? null,
      originZone: shipment.originHub?.zoneCode ?? null,
      destinationHub: shipment.destinationHub?.name ?? null,
      destinationZone: shipment.destinationHub?.zoneCode ?? null,
    },
    candidates: labelled.map(({ label, candidate }) => ({
      label,
      ruleScore: candidate.score,
      openShipments: candidate.factors.openShipments,
      outForDelivery: candidate.factors.outForDelivery,
      hubMatch: candidate.factors.hubMatch,
      sharingLiveLocation: candidate.factors.liveLocation,
      successRate30d: candidate.factors.successRate === null ? null : Math.round(candidate.factors.successRate * 100) / 100,
      deliveries30d: candidate.factors.recentDeliveries,
    })),
  };
  return { prompt, byLabel: new Map(labelled.map(({ label, candidate }) => [label, candidate])) };
}

export type DispatchSuggestion = {
  courierId: string;
  name: string;
  score: number;
  reason: string;
  factors: CandidateFactors;
};

const LABEL_TOKEN = /\bC\d+\b/g;
const MAX_REASON = 160;

function cleanReason(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
}

// Accepts only known labels, at most three, each once, with a plain reason. Labels in a
// reason are replaced by the courier's name here; a reason naming an unknown label is dropped.
export function validateAiSuggestions(raw: unknown, byLabel: Map<string, ScoredCandidate>): DispatchSuggestion[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { suggestions?: unknown }).suggestions)
    ? (raw as { suggestions: unknown[] }).suggestions
    : [];
  const seen = new Set<string>();
  const result: DispatchSuggestion[] = [];
  for (const item of list) {
    if (result.length >= MAX_SUGGESTIONS) break;
    const label = typeof (item as { candidate?: unknown })?.candidate === "string" ? (item as { candidate: string }).candidate.trim().toUpperCase() : "";
    const candidate = byLabel.get(label);
    if (!candidate || seen.has(label)) continue;
    let reason = cleanReason((item as { reason?: unknown }).reason);
    const mentioned = reason.match(LABEL_TOKEN) ?? [];
    if (!reason || mentioned.some((token) => !byLabel.has(token))) continue;
    reason = reason.replace(LABEL_TOKEN, (token) => byLabel.get(token)!.name);
    if (reason.length > MAX_REASON) reason = `${reason.slice(0, MAX_REASON - 1).trimEnd()}…`;
    seen.add(label);
    result.push({ courierId: candidate.courierId, name: candidate.name, score: candidate.score, reason, factors: candidate.factors });
  }
  return result;
}

export function rulesSuggestions(shipment: DispatchShipment, ranked: ScoredCandidate[]): DispatchSuggestion[] {
  return ranked.slice(0, MAX_SUGGESTIONS).map((candidate) => ({
    courierId: candidate.courierId,
    name: candidate.name,
    score: candidate.score,
    reason: rulesReason(candidate.factors, shipment),
    factors: candidate.factors,
  }));
}
