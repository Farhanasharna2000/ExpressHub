// k6 load test: ramps to 50 virtual users over about two minutes against the
// public surface of a deployment. Run with:
//   BASE_URL=https://<preview-deployment> k6 run tests/load/smoke.js
// Optional: TRACKING_NUMBER (a real one) and ACCESS_TOKEN (a customer bearer token
// to include the shipment list). Point it at a preview or staging deployment.
import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TRACKING_NUMBER = __ENV.TRACKING_NUMBER || "EH-000000000000000000000000";
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || "";

// Public tracking is rate limited per IP (60 per 15 minutes). From a single load
// generator most lookups are expected to get 429, which shows the limiter holding
// under load; those responses are not counted as failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 404, 429));

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "60s", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{expected_response:true}": ["p(95)<500"],
    checks: ["rate>0.99"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "max"],
};

export default function smokeTest() {
  group("health", () => {
    const res = http.get(`${BASE_URL}/api/v1/health`, { tags: { name: "health" } });
    check(res, { "health is 200": (r) => r.status === 200 });
  });

  group("public pages", () => {
    const home = http.get(`${BASE_URL}/`, { tags: { name: "home" } });
    check(home, { "home is 200": (r) => r.status === 200 });
    const track = http.get(`${BASE_URL}/track`, { tags: { name: "track page" } });
    check(track, { "track page is 200": (r) => r.status === 200 });
  });

  group("tracking lookup", () => {
    const res = http.get(`${BASE_URL}/api/v1/track/${TRACKING_NUMBER}`, { tags: { name: "track lookup" } });
    check(res, { "tracking answers 200, 404 or 429": (r) => [200, 404, 429].includes(r.status) });
  });

  if (ACCESS_TOKEN) {
    group("shipment list", () => {
      const res = http.get(`${BASE_URL}/api/v1/shipments?limit=20`, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        tags: { name: "shipment list" },
      });
      check(res, { "shipment list answers 200 or 429": (r) => r.status === 200 || r.status === 429 });
    });
  }

  sleep(1);
}
