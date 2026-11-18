// A tiny in-memory stand-in for the Upstash Redis REST API, used only by the e2e
// suite. Production builds refuse the process-local limiter, so the e2e server
// talks to this instead of a real Upstash database. It implements the sliding
// window script @upstash/ratelimit uses (same arithmetic as its Lua source), so
// rate limits still apply during the run. Other commands are accepted and ignored.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const store = new Map();

function read(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function slidingWindow(keys, args) {
  const [currentKey, previousKey, dynamicLimitKey] = keys;
  const tokens = Number(args[0]);
  const now = Number(args[1]);
  const window = Number(args[2]);
  const incrementBy = Number(args[3] ?? 1);
  const dynamicLimit = dynamicLimitKey ? read(dynamicLimitKey) : null;
  const effectiveLimit = dynamicLimit === null ? tokens : Number(dynamicLimit);
  const current = Number(read(currentKey) ?? 0);
  const previous = Math.floor((1 - (now % window) / window) * Number(read(previousKey) ?? 0));
  if (incrementBy > 0 && previous + current >= effectiveLimit) return [-1, effectiveLimit];
  const newValue = current + incrementBy;
  const existing = store.get(currentKey);
  store.set(currentKey, {
    value: newValue,
    expiresAt: newValue === incrementBy ? Date.now() + window * 2 + 1000 : existing?.expiresAt,
  });
  return [effectiveLimit - (newValue + previous), effectiveLimit];
}

function run(command) {
  const [name, ...rest] = command;
  switch (String(name).toUpperCase()) {
    case "EVALSHA":
      // Makes the client resend the full script with EVAL.
      return { error: "NOSCRIPT No matching script. Please use EVAL." };
    case "EVAL": {
      const [script, numKeys, ...params] = rest;
      const keys = params.slice(0, Number(numKeys));
      const args = params.slice(Number(numKeys));
      if (String(script).includes("return {-1, effectiveLimit}") && String(script).includes("INCRBY")) {
        return { result: slidingWindow(keys, args) };
      }
      return { result: [0, Number(args[0] ?? 0)] };
    }
    case "PING":
      return { result: "UE9ORw==" }; // "PONG", base64 as the client expects
    default:
      return { result: 0 };
  }
}

export function startUpstashStub({ port, token }) {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200).end("ok");
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
      const isBatch = request.url?.startsWith("/pipeline") || request.url?.startsWith("/multi-exec");
      const results = isBatch ? body.map(run) : run(body);
      const failed = !isBatch && "error" in results;
      response.writeHead(failed ? 400 : 200, { "content-type": "application/json" }).end(JSON.stringify(results));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.E2E_UPSTASH_PORT ?? 3299);
  await startUpstashStub({ port, token: process.env.E2E_UPSTASH_TOKEN ?? "e2e-upstash-token" });
  console.info(`Upstash stub listening on ${port}`);
}
