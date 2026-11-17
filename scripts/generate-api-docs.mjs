import { mkdirSync, writeFileSync } from "node:fs";

// Source for the API contract. No environment files or credentials are read.
const str = (minLength = 1, maxLength = 100) => ({ type: "string", minLength, maxLength });
const enumeration = (...values) => ({ type: "string", enum: values });
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const id = { type: "string", pattern: "^c[a-z0-9]{24}$", example: "cm123456789012345678901234" };
const date = { type: "string", format: "date-time" };
const roles = enumeration("CUSTOMER", "COURIER", "ADMIN");
const statuses = enumeration("CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED", "CANCELLED");
const payStatuses = enumeration("PENDING", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED");
const email = { type: "string", format: "email", maxLength: 254, description: "Trimmed and lowercased before validation." };
const password = { ...str(12, 72), description: "At least 12 characters and at most 72 UTF-8 bytes." };
const reason = object({ reason: str(3, 1000) });
const booking = object({
  pickupContactName: str(2), pickupContactPhone: str(5, 30), pickupAddress: str(5, 500),
  deliveryContactName: str(2), deliveryContactPhone: str(5, 30), deliveryAddress: str(5, 500),
  parcelWeightKg: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 9999999.999, multipleOf: 0.001 },
  packageDescription: str(1, 1000),
  ...Object.fromEntries(["parcelLengthCm", "parcelWidthCm", "parcelHeightCm"].map((name) => [name, { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 99999999.99, multipleOf: 0.01 }])),
  pickupScheduledAt: { ...date, description: "Must be in the future. Supply all three dimensions or omit all three." },
}, ["pickupContactName", "pickupContactPhone", "pickupAddress", "deliveryContactName", "deliveryContactPhone", "deliveryAddress", "parcelWeightKg"]);
const bookingExample = { pickupContactName: "Example Sender", pickupContactPhone: "01700000000", pickupAddress: "Dhaka pickup address", deliveryContactName: "Example Recipient", deliveryContactPhone: "01800000000", deliveryAddress: "Chattogram delivery address", parcelWeightKg: 1 };
const timestamp = "2026-10-10T06:00:00.000Z";
const profile = { id: id.example, name: "Example Customer", email: "customer@example.com", phone: null, role: "CUSTOMER", isActive: true, createdAt: timestamp, updatedAt: timestamp };
const { isActive, updatedAt, ...authUser } = profile;
const shipment = { ...bookingExample, id: id.example, trackingNumber: "EH-0123456789ABCDEF01234567", customerId: id.example,
  courierId: null, originHubId: null, destinationHubId: null, currentHubId: null, packageDescription: null,
  parcelWeightKg: "1", parcelLengthCm: null, parcelWidthCm: null, parcelHeightCm: null,
  price: "100", currency: "BDT", status: "CREATED", paymentStatus: "PENDING", pickupScheduledAt: null,
  deliveredAt: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
const audit = { id: id.example, actorId: id.example, entityType: "USER", entityId: id.example, shipmentId: null, paymentId: null,
  action: "USER_ROLE_UPDATED", details: { before: { role: "CUSTOMER", isActive: true }, after: { role: "COURIER", isActive: true } }, createdAt: timestamp };
const counts = (values) => Object.fromEntries(values.map((value) => [value, 0]));
const stats = { users: { total: 0, active: 0, inactive: 0, byRole: counts(roles.enum) }, shipments: { total: 0, active: 0, byStatus: counts(statuses.enum) },
  payments: { total: 0, byStatus: counts(payStatuses.enum), amounts: [{ currency: "BDT", status: "PAID", count: 1, amount: "100.00" }] } };
function infer(value) {
  if (value === null) return { type: "string", nullable: true };
  if (Array.isArray(value)) return { type: "array", items: value.length ? infer(value[0]) : {} };
  if (typeof value === "object") return { type: "object", properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, infer(item)])), required: Object.keys(value) };
  return { type: typeof value === "number" ? "integer" : typeof value };
}
const query = (name, schema, description = "", required = false) => ({ name, in: "query", required, schema, description });
const pages = [query("page", { type: "integer", minimum: 1, maximum: 1000000, default: 1 }, "Positive decimal digits only; no leading zeros."), query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 })];
const dates = [query("from", date, "Inclusive createdAt lower bound; from must not exceed to."), query("to", date, "Inclusive upper bound; encode timezone + as %2B.")];
const sort = (...fields) => [query("sortBy", { ...enumeration(...fields), default: "createdAt" }), query("order", { ...enumeration("asc", "desc"), default: "desc" })];
const userQuery = [...pages, query("role", roles), query("isActive", enumeration("true", "false")), query("q", str(1), "Case-insensitive name/email/phone substring."), ...sort("createdAt", "name", "email")];
const shipmentQuery = [...pages, query("status", statuses), query("paymentStatus", payStatuses), query("q", str(1), "Case-insensitive tracking number, contact name or address search."), ...dates, ...sort("createdAt", "updatedAt", "price")];
const auditQuery = [...pages, ...["actorId", "entityId", "shipmentId", "paymentId"].map((key) => query(key, id)), query("entityType", enumeration("USER", "SHIPMENT", "PAYMENT", "HUB", "PRICING_RULE")), query("action", str(), "Exact action match."), ...dates, ...sort("createdAt", "action")];
const errorSchema = { type: "object", required: ["success", "message", "errors"], properties: { success: { type: "boolean", enum: [false] }, message: str(1, 2000), incidentId: str(1, 100), errorId: str(1, 100), errors: { type: "array", items: { type: "object", properties: { code: { type: "string" }, path: { type: "string" }, message: { type: "string" } } } } } };
const descriptions = { 400: "Invalid input, malformed JSON, duplicate/unknown query parameter or invalid ID.", 401: "Missing/invalid authentication or inactive/deleted account.", 403: "Forbidden role or origin.", 404: "Missing, deleted or inaccessible resource.", 409: "Business state conflict or exhausted concurrency retries.", 413: "JSON request exceeds 16 KiB.", 415: "Expected application/json.", 429: "Rate limit exceeded.", 500: "Unexpected internal error (details withheld).", 503: "Required backend/configuration unavailable." };
const codes = {400:"INVALID_INPUT",401:"UNAUTHENTICATED",403:"FORBIDDEN",404:"NOT_FOUND",409:"CONFLICT",413:"REQUEST_TOO_LARGE",415:"UNSUPPORTED_MEDIA_TYPE",429:"RATE_LIMITED",500:"INTERNAL_SERVER_ERROR",503:"SERVICE_UNAVAILABLE"};
const spec = { openapi: "3.0.3", info: { title: "ExpressHub API", version: "1.0.0", description: "Admin aliases are documented for compatibility, not counted as additional business functionality. Examples contain placeholders only. Query parameters are strict and cannot be duplicated. Decimal database values are serialized as strings. HTTP HEAD and approved CORS OPTIONS are bodyless; unsupported methods use Next.js 405 responses." }, servers: [{ url: "http://localhost:3000", description: "Local development; replace with your HTTPS deployment URL" }], security: [{ bearerAuth: [] }], paths: {}, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, refreshCookie: { type: "apiKey", in: "cookie", name: "expresshub_refresh" } }, schemas: { Error: errorSchema } } };
descriptions[422] = "Unsupported currency or invalid payment amount.";
descriptions[502] = "Stripe request failed; retry with the same Idempotency-Key.";
codes[422] = "INVALID_PAYMENT_AMOUNT";
codes[502] = "PAYMENT_PROVIDER_UNAVAILABLE";
const trackingNumber = { type: "string", pattern: "^EH-[0-9A-F]{24}$", example: "EH-0123456789ABCDEF01234567", description: "Case-insensitive; normalised to upper case." };
const operations = [];
function add(method, path, summary, data, options = {}) {
  const status = options.status ?? 200;
  const operationId = `${method}_${path.replace(/[^a-z0-9]+/gi, "_")}`;
  const params = [...(path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: id }] : []), ...(path.includes("{trackingNumber}") ? [{ name: "trackingNumber", in: "path", required: true, schema: trackingNumber }] : []), ...(options.query ?? []), ...(options.headers ?? [])];
  const example = { success: true, message: options.message ?? summary, data };
  const schema = infer(example); schema.properties.success.enum = [true];
  if (data === null) schema.properties.data = { type: "object", nullable: true };
  const response = { description: "Successful operation.", headers: { "Cache-Control": { schema: { type: "string", example: "no-store" } } }, content: { "application/json": { schema, example } } };
  if (options.cookie) response.headers["Set-Cookie"] = { description: "HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure in production. Cookie rotates on login/refresh and clears on logout.", schema: { type: "string" } };
  const responses = { [status]: response };
  for (const code of options.errors ?? [400,401,403,404,409,429,500,503]) responses[code] = { description: descriptions[code], ...(code === 429 ? { headers: { "Retry-After": { schema: { type: "integer", minimum: 1 } } } } : {}), content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { success: false, message: descriptions[code], errors: code === 400 ? [{ path: "", message: "Invalid input" }] : [{ code: codes[code] }] } } } };
  if (options.body) for (const code of [413,415]) responses[code] = { description: descriptions[code], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  const op = { operationId, tags: [options.tag ?? path.split("/")[3] ?? "health"], summary, description: options.description ?? "", parameters: params, responses,
    ...(options.public ? { security: [] } : options.cookieAuth ? { security: [{ refreshCookie: [] }] } : {}),
    ...(options.body ? { requestBody: { required: true, content: { "application/json": { schema: options.body, example: options.example } } } } : {}) };
  (spec.paths[path] ??= {})[method] = op;
  operations.push({ method, path, op, options, example, status });
}
const prefix = "/api/v1";
const authData = { user: authUser, accessToken: "<access-jwt>" };
add("post", `${prefix}/auth/register`, "Register a Customer", authData, { public:true,cookie:true,status:201,message:"Account created successfully",body:object({name:str(2),email,password,phone:str(5,30)},["name","email","password"]),example:{name:"Example Customer",email:"{{email}}",password:"{{password}}"},description:"Public registration always creates CUSTOMER. Rate limit: 5 per 15 minutes per configured anonymous bucket. Raw refresh token is cookie-only." });
add("post", `${prefix}/auth/login`, "Log in", authData, { public:true,cookie:true,message:"Login successful",body:object({email,password:{...password,minLength:1}}),example:{email:"{{email}}",password:"{{password}}"},description:"10 attempts per 15 minutes. Generic credential errors. Customer/Courier/Admin accounts use the same login endpoint." });
add("post", `${prefix}/auth/refresh-token`, "Rotate refresh token", {accessToken:"<access-jwt>"}, {cookie:true,cookieAuth:true,message:"Token refreshed successfully",description:"Uses expresshub_refresh cookie; previous token is revoked. Cookie-origin checks apply. 30 requests per 15 minutes."});
add("post", `${prefix}/auth/logout`, "Log out", null, {public:true,cookie:true,message:"Logged out successfully",description:"Revokes the supplied refresh cookie if present and clears it. Missing cookie is allowed; no bearer required. Cookie-origin checks apply. Existing access JWT expires normally."});
add("get", `${prefix}/users/me`, "Read own profile", {user:profile}, {message:"Profile fetched successfully"});
add("patch", `${prefix}/users/me`, "Update own profile", {user:profile}, {message:"Profile updated successfully",body:{...object({name:str(2),email,phone:{...str(5,30),nullable:true},currentPassword:{...str(1,200),description:"Required only when email changes."}},[]),minProperties:1},example:{name:"Updated Customer",phone:"01700000000"},description:"At least one profile field; unknown fields rejected; email conflicts return 409. Changing email requires currentPassword (400 CURRENT_PASSWORD_REQUIRED or INVALID_CURRENT_PASSWORD otherwise), revokes every other session and sets a fresh refresh cookie for this one."});
add("get", `${prefix}/users`, "List users", {users:[profile],pagination}, {query:userQuery,message:"Users fetched successfully",description:"ADMIN only; soft-deleted users excluded; no password or session fields."});
add("get", `${prefix}/users/{id}`, "Read user profile", {user:profile}, {message:"User fetched successfully",description:"Owner or ADMIN; other users receive 404."});
add("patch", `${prefix}/users/{id}/role`, "Change user role", {user:{...profile,role:"COURIER"}}, {message:"User role updated successfully",body:object({role:roles}),example:{role:"COURIER"},description:"ADMIN only. Cannot change own role. Revokes refresh sessions and atomically audits a real change."});
add("patch", `${prefix}/users/{id}/status`, "Activate or deactivate user", {user:{...profile,isActive:false}}, {message:"User status updated successfully",body:object({isActive:{type:"boolean"}}),example:{isActive:false},description:"ADMIN only; cannot change own status. Deactivation revokes refresh sessions; reactivation does not restore them."});
add("delete", `${prefix}/users/{id}`, "Archive user", {user:{id:id.example,deletedAt:timestamp}}, {message:"User deleted successfully",body:reason,example:{reason:"Archive resolved account"},description:"ADMIN only. Blocks self-deletion, active owned/assigned shipments and unresolved payments/refunds. Revokes sessions; preserves history. Repeat deletion returns 404."});
add("post", `${prefix}/shipments`, "Book shipment", {shipment}, {status:201,message:"Shipment created successfully",body:booking,example:bookingExample,description:"CUSTOMER only. Exactly one effective pricing rule must cover the weight, otherwise 503. Server controls customer, tracking number, status, currency and price. Dimensions must be all supplied or all omitted."});
for (const suffix of ["", "/search", "/my-shipments"]) add("get", `${prefix}/shipments${suffix}`, suffix === "/search" ? "Search shipments" : suffix ? "List own or assigned shipments" : "List visible shipments", {shipments:[shipment],pagination}, {message:"Shipments fetched successfully",query:shipmentQuery.map((p)=>({...p,...(suffix==="/search" && p.name==="q"?{required:true}:{})})),description:"CUSTOMER sees owned, COURIER assigned, ADMIN all non-deleted shipments. On my-shipments ADMIN sees only owned shipments. Filters intersect ownership. Stable ID tie-breaker; offset pagination may shift with concurrent writes."});
add("get", `${prefix}/shipments/{id}`, "Read shipment", {shipment:{...shipment,events:[{id:id.example,type:"CREATED",fromStatus:null,toStatus:"CREATED",publicNote:null,occurredAt:timestamp}]}}, {message:"Shipment fetched successfully",description:"Owner CUSTOMER, assigned COURIER or ADMIN. Deleted/inaccessible shipments return 404. Events are ordered by occurredAt ascending, then ID. Customers receive public event fields only; internalNote and actorId are included only for assigned Couriers/Admins."});
add("patch", `${prefix}/shipments/{id}/assign-courier`, "Assign courier", {shipment:{...shipment,courierId:id.example}}, {message:"Courier assigned successfully",body:object({courierId:id,expectedCourierId:{...id,nullable:true}}),example:{courierId:"{{courierId}}",expectedCourierId:null},description:"ADMIN only. Active courier required. CREATED/FAILED only. expectedCourierId must match current assignment; null for first assignment. Concurrent change returns 409."});
add("patch", `${prefix}/shipments/{id}/status`, "Transition shipment", {shipment:{...shipment,status:"CANCELLED"}}, {message:"Shipment updated successfully",body:object({status:statuses,expectedStatus:statuses,note:str(3,1000)},["status","expectedStatus"]),example:{status:"CANCELLED",expectedStatus:"CREATED",note:"Booking no longer needed"},description:"CREATED→PICKED_UP→IN_TRANSIT→OUT_FOR_DELIVERY→DELIVERED or FAILED. ADMIN retries FAILED→IN_TRANSIT or returns FAILED→RETURNED. Owner/ADMIN can cancel CREATED only. Operational transitions require PAID and an active assigned courier. DELIVERED/FAILED/RETURNED require a note. Terminal states cannot transition; pending checkout blocks cancellation."});
add("delete", `${prefix}/shipments/{id}`, "Archive shipment", {shipment:{id:id.example,deletedAt:timestamp}}, {message:"Shipment deleted successfully",body:reason,example:{reason:"Archive resolved shipment"},description:"ADMIN only. DELIVERED, RETURNED or CANCELLED only; unresolved payment/refund attempts block archival. Preserves events, payments and audits. Repeat returns 404."});
for (const [method, source, target] of [["get","users","users"],["patch","users/{id}/role","users/{id}/role"],["get","shipments","shipments"]]) {
  const original = operations.find((o)=>o.path===`${prefix}/${source}` && o.method===method);
  add(method, `${prefix}/admin/${target}`, `Admin: ${original.op.summary}`, original.example.data, {...original.options,tag:"admin",description:`ADMIN only. Alias of ${method.toUpperCase()} ${prefix}/${source}; same validation and response. ${original.options.description ?? ""}`});
}
add("get", `${prefix}/admin/dashboard-stats`, "Read dashboard statistics", stats, {description:"ADMIN only. No query parameters. One database snapshot. User/shipment counts exclude deletion; active shipments include FAILED. Payment history is retained; amounts are strings grouped by currency/status, not net revenue or refunded amounts."});
add("get", `${prefix}/courier/stats`, "Read courier statistics", { total: 10, readyPickup: 2, inRoute: 3, delivered: 5, byStatus: { ...counts(statuses.enum), CREATED: 2, IN_TRANSIT: 3, DELIVERED: 5 } }, { tag: "courier", message: "Courier statistics fetched successfully", description: "COURIER or ADMIN only. Aggregates all assigned non-deleted shipments by status." });
const publicTracking = { trackingNumber: trackingNumber.example, status: "IN_TRANSIT", createdAt: timestamp, deliveredAt: null, events: [{ type: "CREATED", status: "CREATED", occurredAt: timestamp, hub: null }, { type: "HUB_TRANSFER", status: null, occurredAt: timestamp, hub: "Chattogram Hub" }] };
add("get", `${prefix}/track/{trackingNumber}`, "Track a shipment publicly", { tracking: publicTracking }, { public: true, tag: "track", message: "Tracking fetched successfully", errors: [400, 404, 429, 500, 503], description: "No authentication. Returns only tracking number, status, booking and delivery dates, and public timeline events (booked, status changes, hub transfers with hub name, delivery attempts, cancellation). Never returns names, phones, addresses, price, notes or internal IDs; courier assignment and admin corrections are omitted. Soft-deleted or unknown numbers return 404. Rate limit: 60 per 15 minutes per client." });
add("get", `${prefix}/track/{trackingNumber}/stream`, "Stream live tracking updates", { tracking: publicTracking }, { public: true, tag: "track", message: "Server-Sent Events stream", errors: [400, 404, 429, 500, 503], description: "No authentication. Server-Sent Events (text/event-stream). Sends retry, then `event: tracking` with the same public shape as GET /track/{trackingNumber}, then a new tracking event only when the timeline changes (server checks every 5 seconds). `: heartbeat` comments every 25 seconds. Ends with `event: end` and data {reason}: final (DELIVERED, RETURNED or CANCELLED), gone (shipment removed), error (repeated lookup failures) or timeout (after 270 seconds; reconnect). Rate limit: 30 connections per 15 minutes per client." });
{
  const stream = spec.paths[`${prefix}/track/{trackingNumber}/stream`].get.responses[200];
  stream.description = "Server-Sent Events stream.";
  stream.headers["Cache-Control"].schema.example = "no-cache, no-transform";
  stream.content = { "text/event-stream": { schema: { type: "string" }, example: `retry: 3000\n\nevent: tracking\ndata: ${JSON.stringify(publicTracking)}\n\nevent: end\ndata: {"reason":"final"}\n\n` } };
}
const assistantMessage = { type: "object", properties: { role: enumeration("user", "assistant"), content: { ...str(1, 8000), description: "User messages up to 2000 characters, assistant messages up to 8000." } }, required: ["role", "content"], additionalProperties: false };
add("get", `${prefix}/ai/status`, "Read AI feature availability", { assistant: true, bookingDraft: true, opsBrief: false }, { tag: "ai", message: "AI status fetched successfully", description: "Any signed-in user. assistant is true only when AI is enabled on the server and the caller is a CUSTOMER or COURIER; bookingDraft only for a CUSTOMER; opsBrief only for an ADMIN." });
const briefShipment = { id: id.example, trackingNumber: "EH-0123456789ABCDEF01234567", status: "CREATED", hoursSinceUpdate: 30 };
const opsBrief = {
  day: "2026-11-16", model: "gemini-3.1-flash-lite", generatedAt: timestamp, cached: false,
  brief: { headline: "4 paid shipments are waiting for a courier.", summary: "6 shipments were booked today and 2 delivered. 1 delivery failed and 2 shipments have had no update for over 48 hours.", actions: [{ title: "Assign couriers to paid shipments", detail: "4 paid shipments have no courier and 9 couriers are active." }], unverified: [] },
  facts: { day: "2026-11-16", delayThresholdHours: 48, shipments: { total: 40, active: 12, byStatus: { ...counts(statuses.enum), CREATED: 5, IN_TRANSIT: 3, DELIVERED: 20 } }, today: { created: 6, delivered: 2, failed: 1 }, failed: { count: 1, recent: [{ ...briefShipment, status: "FAILED" }] }, delayed: { count: 2, oldest: [{ ...briefShipment, status: "IN_TRANSIT", hoursSinceUpdate: 71 }] }, unassignedPaid: { count: 4, oldest: [briefShipment] }, payments: { pending: 7, paid: 25, failed: 0 }, couriers: { active: 9 } },
};
add("get", `${prefix}/ai/ops-brief`, "Read today's operations brief", { brief: { ...opsBrief, cached: true } }, { tag: "ai", message: "Operations brief fetched", errors: [401, 403, 503], description: "ADMIN only. Returns the brief this admin prepared today (Bangladesh day), or brief: null. Never calls the AI provider. 503 AI_UNAVAILABLE when AI is disabled." });
add("post", `${prefix}/ai/ops-brief`, "Prepare today's operations brief", { brief: opsBrief }, {
  tag: "ai", message: "Operations brief prepared",
  body: object({ refresh: { type: "boolean", default: false } }, []),
  example: { refresh: false },
  errors: [400, 401, 403, 429, 502, 503],
  description: "ADMIN only. Returns today's saved brief (cached: true) without calling the AI provider, unless refresh is true. Otherwise summarises server-side figures (status counts, today's bookings and deliveries, failed shipments, shipments with no update for 48 hours, paid shipments with no courier, pending payments) with tracking numbers but no customer names, phones or addresses. facts holds the exact figures used. brief.unverified lists any number in the text that is not in facts. New briefs are rate limited per admin (3 per 15 minutes) and saved in an AI_OPS_BRIEF audit record, which is the per-day cache; failures write AI_OPS_BRIEF_FAILED. 502 AI_UPSTREAM_ERROR; 503 AI_UNAVAILABLE, AI_BUSY or AI_QUOTA_EXCEEDED."
});
add("post", `${prefix}/ai/booking-draft`, "Draft a booking from a description", { draft: { pickupContactName: "Rina", pickupContactPhone: "01700000000", pickupAddress: "House 12, Road 5, Gulshan 1, Dhaka", deliveryContactName: "Rahim", deliveryContactPhone: "01800000000", deliveryAddress: "Agrabad, Chattogram", packageDescription: "Books", parcelWeightKg: 2, pickupScheduledAt: "2026-11-17T10:00:00+06:00" }, filled: ["pickupContactName", "pickupContactPhone", "pickupAddress", "deliveryContactName", "deliveryContactPhone", "deliveryAddress", "packageDescription", "parcelWeightKg", "pickupScheduledAt"], missing: [], note: null }, {
  tag: "ai", message: "Booking draft prepared",
  body: object({ text: str(10, 1500) }),
  example: { text: "Send a 2 kg box of books from Rina, 01700000000, House 12, Road 5, Gulshan 1, Dhaka to Rahim, 01800000000, Agrabad, Chattogram. Pickup tomorrow at 10am." },
  errors: [400, 401, 403, 422, 429, 502, 503],
  description: "CUSTOMER only. Never creates a shipment: returns booking form values extracted from free text (English, Bangla or Banglish) for the customer to review and submit through POST /shipments. Each value is checked with the shipment validator; invalid or unstated fields are omitted and required ones listed in missing. Rate limited per user (10 requests per 15 minutes). 422 AI_REFUSED when the text cannot be used; 503 AI_UNAVAILABLE, AI_BUSY or AI_QUOTA_EXCEEDED; 502 AI_UPSTREAM_ERROR. Writes an AI_BOOKING_DRAFT audit record with field names and token counts, never the text."
});
add("post", `${prefix}/ai/assistant`, "Ask the shipment assistant", { reply: "Your parcel EXH-ABC123 left the Dhaka hub and is in transit to Chattogram.", toolCalls: [{ name: "get_shipment", shipmentId: id.example, ok: true }], shipments: [{ id: id.example, trackingNumber: "EXH-ABC123" }] }, {
  tag: "ai", message: "Assistant replied successfully",
  body: { type: "object", properties: { messages: { type: "array", minItems: 1, maxItems: 20, items: assistantMessage } }, required: ["messages"], additionalProperties: false },
  example: { messages: [{ role: "user", content: "Where is my latest parcel?" }] },
  errors: [400, 401, 403, 429, 502, 503],
  description: "CUSTOMER or COURIER only. Read-only: answers from the caller's own shipments and payments through role-scoped tools and never changes data. Messages alternate and start and end with the user; only visible text is accepted. The caller's 5 newest shipments are preloaded so common questions need one model call; shipments lists records named in the reply for linking. Rate limited per user (20 requests per 15 minutes). Returns 503 AI_UNAVAILABLE when AI is disabled, 503 AI_BUSY or 502 AI_UPSTREAM_ERROR on provider failures. Each request writes an AI_ASSISTANT_QUERY audit record with tool names, record ids and token counts, never message text."
});
add("get", `${prefix}/admin/audit-logs`, "Inspect audit history", {auditLogs:[audit],pagination}, {message:"Audit logs fetched successfully",query:auditQuery,description:"ADMIN only. Exact filters; historical deleted entities retained. actorId may be null for system events. details are action-dependent JSON; no mutation API."});
for (const path of ["/api/v1/health","/api/health"]) add("get",path,"Check database readiness",{status:"ok",database:"connected",timestamp},{public:true,tag:"health",message:"API is healthy",errors:[503],description:"Read-only SELECT 1. Unversioned path is a compatibility alias. Database unavailable returns DATABASE_UNAVAILABLE."});
const payment = { id:id.example, shipmentId:id.example, payerId:id.example, provider:"STRIPE", amount:"100", currency:"BDT", status:"PENDING", paidAt:null, refundedAt:null, createdAt:timestamp, updatedAt:timestamp };
const paymentQuery = [...pages, query("status", payStatuses), query("shipmentId", id)];
for (const suffix of ["create", "initiate"]) add("post", `${prefix}/payments/${suffix}`, "Prepare Stripe Checkout", {payment, checkoutUrl:"https://checkout.stripe.com/example"}, {
  message:"Payment checkout prepared", body:object({shipmentId:id}), example:{shipmentId:"{{shipmentId}}"},
  headers:[{name:"Idempotency-Key",in:"header",required:true,schema:{type:"string",format:"uuid"},description:"Reuse the same UUID for retries of one attempt; use a new UUID for a new attempt."}],
  errors:[400,401,403,404,409,422,429,500,502,503],
  description:"CUSTOMER owning an undeleted CREATED shipment only. Price and currency come from the server quote. create and initiate are aliases. Only one pending/accepted attempt per shipment. Reuse the same Idempotency-Key after network/provider errors. checkoutUrl can be null when Checkout is no longer pending/open. Initiation never confirms payment; a verified Stripe webhook settles it."
});
add("get", `${prefix}/payments/{id}`, "Read payment", {payment}, {message:"Payment fetched successfully",description:"Paying CUSTOMER or ADMIN; another customer receives 404, COURIER receives 403. Retains history for deleted shipments. Provider references and idempotency keys are not exposed."});
add("post", `${prefix}/payments/{id}/refund`, "Initiate payment refund", {payment:{...payment,status:"REFUNDED",refundedAt:timestamp}}, {
  message:"Refund initiated successfully",
  body:object({reason:str(3,1000)},[]),
  example:{reason:"Customer requested refund"},
  description:"ADMIN or owning CUSTOMER. Initiates a Stripe refund for a confirmed PAID payment. Updates payment and shipment status to REFUND_PENDING or REFUNDED."
});
for (const suffix of ["", "/my-payments"]) add("get", `${prefix}/payments${suffix}`, "List own payments", {payments:[payment],pagination}, {message:"Payments fetched successfully",query:paymentQuery,description:"CUSTOMER or ADMIN only. Both aliases return only the caller's own payments, including retained history for deleted shipments. Sorted by createdAt descending and ID ascending."});
add("post", `${prefix}/payments/webhook`, "Receive Stripe webhook", {received:true}, {public:true,message:"Webhook received",errors:[400,413,500,503],headers:[{name:"Stripe-Signature",in:"header",required:true,schema:{type:"string"},description:"Stripe-generated signature over the original request bytes; use Stripe CLI for local delivery."}],description:"Provider-only endpoint; no bearer token. Requires original signed JSON body (maximum 256 KiB), valid recent signature and matching account/mode. Server verifies payment metadata, amount and currency against Stripe. Duplicate events are acknowledged without repeating changes; unrelated events are ignored. A 503 requests a retry. Send real signed events through Stripe CLI; the Postman reference body alone cannot simulate a valid payment."});
const webhook = spec.paths[`${prefix}/payments/webhook`].post;
webhook.requestBody = {required:true,content:{"application/json":{schema:{type:"object",additionalProperties:true,description:"Original Stripe event JSON; do not modify signed bytes."},example:{id:"evt_example",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_example"}}}}}};
webhook.responses[413].description = "Webhook request exceeds 256 KiB.";
webhook.responses[413].content["application/json"].example.message = "Webhook body is too large";
const receipt = webhook.responses[200].content["application/json"].schema.properties.data;
receipt.properties.duplicate = {type:"boolean"};
receipt.properties.ignored = {type:"boolean"};
for (const [suffix, checkout, message] of [
  ["success","returned","Checkout returned. Check your authenticated payment status for confirmation."],
  ["cancel","cancelled","Checkout was left without confirmation. The payment session may still be open."]
]) add("get", `${prefix}/payments/return/${suffix}`, `Checkout return: ${suffix}`, {checkout,paymentConfirmed:false}, {public:true,message,errors:[],query:suffix==="success"?[query("session_id",str(1,500),"Optional Stripe redirect value; not used to confirm payment.")]:[],description:"Public informational response. Does not modify payments or shipments. Check authenticated payment detail for verified status; leaving Checkout does not expire its session."});
for (const operation of operations.filter(o=>o.path.includes("/payments"))) {
  const data = operation.op.responses[operation.status].content["application/json"].schema.properties.data;
  if (data.properties?.checkoutUrl) data.properties.checkoutUrl.nullable = true;
  const paymentSchema = data.properties?.payment ?? data.properties?.payments?.items;
  if (paymentSchema) {
    paymentSchema.properties.status = payStatuses;
    for (const field of ["paidAt", "refundedAt"]) paymentSchema.properties[field] = {...date,nullable:true};
  }
}
// AI routes share status codes with payments but fail for different reasons.
const aiErrors = {
  422: ["The description could not be used for a booking.", "AI_REFUSED"],
  502: ["The AI provider returned an error or unreadable output; try again.", "AI_UPSTREAM_ERROR"],
  503: ["AI is disabled, busy, out of daily quota, or the rate limiter is unavailable.", "AI_UNAVAILABLE"],
};
for (const operation of operations.filter(o=>o.path.includes("/ai/"))) {
  for (const [code, [description, errorCode]] of Object.entries(aiErrors)) {
    const response = operation.op.responses[code];
    if (!response) continue;
    response.description = description;
    response.content["application/json"].example = { success: false, message: description, errors: [{ code: errorCode }] };
  }
}
// Broaden action-dependent/nullable response fields instead of implying a single audit event shape.
for (const op of operations) {
  const data = op.op.responses[op.status].content["application/json"]?.schema.properties.data;
  if (data?.properties?.auditLogs) {
    const props = data.properties.auditLogs.items.properties;
    props.details = { type:"object", nullable:true, additionalProperties:true, description:"Stored action-specific JSON details." };
    props.actorId.nullable = true;
  }
}
const shipmentDetailSchema = operations.find(o => o.method === "get" && o.path === `${prefix}/shipments/{id}`).op.responses[200].content["application/json"].schema.properties.data.properties.shipment;
const eventSchema = shipmentDetailSchema.properties.events.items;
eventSchema.properties.type = enumeration("CREATED", "COURIER_ASSIGNED", "STATUS_CHANGED", "CUSTOMER_CANCELLED", "HUB_TRANSFER", "DELIVERY_ATTEMPT", "ADMIN_CORRECTION");
eventSchema.properties.fromStatus = {...statuses, nullable:true};
eventSchema.properties.toStatus = {...statuses, nullable:true};
eventSchema.properties.publicNote = {...str(0,1000), nullable:true};
eventSchema.properties.occurredAt = date;
eventSchema.properties.internalNote = {...str(0,1000), nullable:true, description:"Omitted for customers."};
eventSchema.properties.actorId = {...id, nullable:true, description:"Omitted for customers."};
const collection = { info:{name:"ExpressHub API",schema:"https://schema.getpostman.com/json/collection/v2.1.0/collection.json",description:"Run individual requests in the documented workflow; do not run the whole collection against production. Set credentials locally, use the cookie jar, and switch accessToken for the required role. No secrets are included."},auth:{type:"bearer",bearer:[{key:"token",value:"{{accessToken}}",type:"string"}]},variable:[{key:"baseUrl",value:"http://localhost:3000"},...['accessToken','email','password','userId','shipmentId','courierId','trackingNumber'].map(key=>({key,value:""}))],item:[] };
for (const {method,path,op,options,example,status} of operations) {
  const groupName=op.tags[0];let group=collection.item.find(g=>g.name===groupName);
  if(!group){group={name:groupName,item:[]};collection.item.push(group);}
  const resource=path.includes("/users/")?"userId":path.includes("/payments/")?"paymentId":"shipmentId";
  const urlPath=path.replace("{id}",`{{${resource}}}`).replace("{trackingNumber}","{{trackingNumber}}");
  const queryParams=(options.query??[]).map(p=>({key:p.name,value:String(p.schema.default??(p.name==='q'?'Dhaka':'')),disabled:!p.required,description:p.description}));
  const request={method:method.toUpperCase(),header:[...(op.requestBody?[{key:"Content-Type",value:"application/json"}]:[]),...(options.headers??[]).map(p=>({key:p.name,value:p.name==="Idempotency-Key"?"{{idempotencyKey}}":"{{stripeSignature}}"}))],url:{raw:`{{baseUrl}}${urlPath}${queryParams.some(p=>!p.disabled)?'?'+queryParams.filter(p=>!p.disabled).map(p=>`${p.key}=${p.value}`).join('&'):''}`,host:["{{baseUrl}}"],path:urlPath.slice(1).split("/"),...(queryParams.length?{query:queryParams}:{})},description:op.description,
    ...(options.public||options.cookieAuth?{auth:{type:"noauth"}}:{}),...(op.requestBody?{body:{mode:"raw",raw:JSON.stringify(options.example??op.requestBody.content["application/json"].example,null,2),options:{raw:{language:"json"}}}}:{})};
  const item={name:op.summary,request,response:[{name:"Success example",originalRequest:request,status:status===201?"Created":"OK",code:status,header:[{key:"Content-Type",value:"application/json"},{key:"Cache-Control",value:"no-store"}],body:JSON.stringify(example,null,2)}]};
  if (["/api/v1/auth/register","/api/v1/auth/login","/api/v1/auth/refresh-token"].includes(path)) item.event=[{listen:"test",script:{type:"text/javascript",exec:["if (pm.response.code >= 200 && pm.response.code < 300) {", "  const data = pm.response.json().data;", "  if (data.accessToken) pm.collectionVariables.set('accessToken', data.accessToken);", "}"]}}];
  if(path==="/api/v1/auth/logout")item.event=[{listen:"test",script:{type:"text/javascript",exec:["if (pm.response.code === 200) pm.collectionVariables.unset('accessToken');"]}}];
  if(path==="/api/v1/shipments"&&method==="post")item.event=[{listen:"test",script:{type:"text/javascript",exec:["if (pm.response.code === 201) pm.collectionVariables.set('shipmentId', pm.response.json().data.shipment.id);"]}}];
  group.item.push(item);
}
mkdirSync("docs/postman",{recursive:true});
writeFileSync("docs/openapi.json",JSON.stringify(spec,null,2)+"\n");
writeFileSync("docs/postman/ExpressHub.postman_collection.json",JSON.stringify(collection,null,2)+"\n");
await import("./prepare-postman.mjs");
console.info(`Generated OpenAPI and Postman documents for ${operations.length} operations.`);
