import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { MAX_WEBHOOK_URL_LENGTH } from "@/lib/merchant/scopes";

// Outbound requests to merchant-supplied URLs (webhooks). Without these checks a
// merchant could point ExpressHub at its own internal network or a cloud metadata
// service and read the responses or probe ports (SSRF).

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type Classification = { allowed: true } | { allowed: false; reason: string };
const blocked = (reason: string): Classification => ({ allowed: false, reason });
const ALLOWED: Classification = { allowed: true };

function ipv4Octets(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function inV4(octets: number[], base: string, bits: number) {
  const value = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const baseOctets = base.split(".").map(Number);
  const baseValue = ((baseOctets[0] << 24) | (baseOctets[1] << 16) | (baseOctets[2] << 8) | baseOctets[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const V4_BLOCKED: [string, number, string][] = [
  ["0.0.0.0", 8, "unspecified"],
  ["10.0.0.0", 8, "private"],
  ["100.64.0.0", 10, "shared (CGNAT)"],
  ["127.0.0.0", 8, "loopback"],
  ["169.254.0.0", 16, "link-local or cloud metadata"],
  ["172.16.0.0", 12, "private"],
  ["192.0.0.0", 24, "IETF protocol assignment"],
  ["192.0.2.0", 24, "documentation"],
  ["192.88.99.0", 24, "6to4 relay"],
  ["192.168.0.0", 16, "private"],
  ["198.18.0.0", 15, "benchmarking"],
  ["198.51.100.0", 24, "documentation"],
  ["203.0.113.0", 24, "documentation"],
  ["224.0.0.0", 4, "multicast"],
  ["240.0.0.0", 4, "reserved or broadcast"],
];

function classifyV4(octets: number[]): Classification {
  const hit = V4_BLOCKED.find(([base, bits]) => inV4(octets, base, bits));
  return hit ? blocked(`IPv4 ${hit[2]} address`) : ALLOWED;
}

// Expands an IPv6 address (including "::" and a trailing dotted IPv4) to 8 groups.
function ipv6Groups(input: string) {
  let address = input.replace(/^\[|\]$/g, "");
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (dotted) {
    const octets = ipv4Octets(dotted[1]);
    if (!octets) return null;
    address = `${address.slice(0, dotted.index)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

const embeddedV4 = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff];

function classifyV6(groups: number[]): Classification {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (firstFiveZero && g5 === 0 && g6 === 0 && g7 === 0) return blocked("IPv6 unspecified address");
  if (firstFiveZero && g5 === 0 && g6 === 0 && g7 === 1) return blocked("IPv6 loopback address");
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) reach the IPv4 address inside.
  if (firstFiveZero && (g5 === 0xffff || g5 === 0)) return classifyV4(embeddedV4(g6, g7));
  // NAT64 well-known prefix 64:ff9b::/96 translates to the embedded IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return classifyV4(embeddedV4(g6, g7));
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return blocked("IPv6 local-use NAT64 address");
  // 6to4 2002:aabb:ccdd::/48 embeds the IPv4 address aa.bb.cc.dd.
  if (g0 === 0x2002) return classifyV4(embeddedV4(g1, g2));
  if (g0 === 0x2001 && g1 === 0) return blocked("IPv6 Teredo address");
  if (g0 === 0x2001 && g1 === 0xdb8) return blocked("IPv6 documentation address");
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return blocked("IPv6 documentation address");
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x10) return blocked("IPv6 ORCHID address");
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x20) return blocked("IPv6 ORCHIDv2 address");
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return blocked("IPv6 discard address");
  if ((g0 & 0xfe00) === 0xfc00) return blocked("IPv6 unique local address");
  if ((g0 & 0xffc0) === 0xfe80) return blocked("IPv6 link-local address");
  if ((g0 & 0xffc0) === 0xfec0) return blocked("IPv6 site-local address");
  if ((g0 & 0xff00) === 0xff00) return blocked("IPv6 multicast address");
  // Only global unicast (2000::/3) is reachable on the public internet.
  if ((g0 & 0xe000) !== 0x2000) return blocked("IPv6 address outside global unicast");
  return ALLOWED;
}

export function classifyAddress(address: string): Classification {
  const bare = address.replace(/^\[|\]$/g, "");
  if (isIP(bare.split("%")[0]) === 4) {
    const octets = ipv4Octets(bare);
    return octets ? classifyV4(octets) : blocked("Invalid IPv4 address");
  }
  if (isIP(bare.split("%")[0]) === 6) {
    const groups = ipv6Groups(bare);
    return groups ? classifyV6(groups) : blocked("Invalid IPv6 address");
  }
  return blocked("Not an IP address");
}

export { MAX_WEBHOOK_URL_LENGTH };

// Shape checks that need no network. The URL parser already normalises numeric IPv4
// forms (2130706433, 0x7f.1, 0177.0.0.1) to dotted decimal before we classify them.
export function parseWebhookUrl(raw: string): URL {
  if (raw.length > MAX_WEBHOOK_URL_LENGTH) throw new UnsafeUrlError("URL is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Enter a valid URL");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Webhook URLs must use https");
  if (url.username || url.password) throw new UnsafeUrlError("Webhook URLs must not contain credentials");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Webhook URLs must use port 443");
  if (url.hash) throw new UnsafeUrlError("Webhook URLs must not contain a fragment");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Webhook URLs must point to a public host");
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    const verdict = classifyAddress(bare);
    if (!verdict.allowed) throw new UnsafeUrlError(`Webhook URLs must not point to a ${verdict.reason}`);
  } else if (!host.includes(".")) {
    throw new UnsafeUrlError("Webhook URLs must use a fully qualified host name");
  }
  return url;
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));

// Every address the name resolves to must be public, so DNS answers that mix a public
// and a private address are rejected instead of picking one at random.
export async function resolvePublicAddress(url: URL, resolve: Resolver = systemResolver): Promise<ResolvedAddress> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);
  if (literal) {
    const verdict = classifyAddress(host);
    if (!verdict.allowed) throw new UnsafeUrlError(`Destination is a ${verdict.reason}`);
    return { address: host, family: literal === 6 ? 6 : 4 };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UnsafeUrlError("Host name could not be resolved");
  }
  if (!addresses.length) throw new UnsafeUrlError("Host name could not be resolved");
  for (const entry of addresses) {
    const verdict = classifyAddress(entry.address);
    if (!verdict.allowed) throw new UnsafeUrlError(`Host resolves to a ${verdict.reason}`);
  }
  return addresses[0];
}

export const WEBHOOK_TIMEOUT_MS = 5000;
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

export type SafePostResult = { status: number };

// POSTs to a vetted URL, connecting to the exact address that was checked (no second
// DNS lookup an attacker could change), never following redirects, with a hard
// timeout and a cap on how much of the response is read.
export async function safePost(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  { resolve = systemResolver, timeoutMs = WEBHOOK_TIMEOUT_MS, maxBytes = WEBHOOK_MAX_RESPONSE_BYTES } = {},
): Promise<SafePostResult> {
  const url = parseWebhookUrl(rawUrl);
  const pinned = await resolvePublicAddress(url, resolve);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options && typeof options === "object" && "all" in options && options.all) {
      (callback as unknown as (error: null, addresses: { address: string; family: number }[]) => void)(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  };

  return new Promise<SafePostResult>((resolvePromise, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: host,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      agent: false,
      lookup,
      ...(isIP(host) ? {} : { servername: host }),
      headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
    }, (response) => {
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) response.destroy();
      });
      const finish = () => resolvePromise({ status: response.statusCode ?? 0 });
      response.on("end", finish);
      response.on("close", finish);
      response.on("error", finish);
    });
    // A timeout is retryable, unlike an unsafe address, so it is a plain Error.
    const timeout = new Error(`No response within ${timeoutMs / 1000}s`);
    const timer = setTimeout(() => request.destroy(timeout), timeoutMs);
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error === timeout ? timeout : new Error(`Connection failed: ${(error as NodeJS.ErrnoException).code ?? error.message}`));
    });
    request.on("close", () => clearTimeout(timer));
    request.end(body);
  });
}
