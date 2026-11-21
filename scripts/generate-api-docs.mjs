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
const profile = { id: id.example, name: "Example Customer", email: "customer@example.com", phone: null, role: "CUSTOMER", isActive: true, emailNotifications: true, createdAt: timestamp, updatedAt: timestamp };
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
const spec = { openapi: "3.0.3", info: { title: "ExpressHub API", version: "1.0.0", description: "Admin aliases are documented for compatibility, not counted as additional business functionality. Examples contain placeholders only. Query parameters are strict and cannot be duplicated. Decimal database values are serialized as strings. HTTP HEAD and approved CORS OPTIONS are bodyless; unsupported methods use Next.js 405 responses." }, servers: [{ url: "http://localhost:3000", description: "Local development; replace with your HTTPS deployment URL" }], security: [{ bearerAuth: [] }], paths: {}, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, merchantApiKey: { type: "http", scheme: "bearer", bearerFormat: "eh_live_<prefix>_<secret>", description: "Merchant API key created at /customer/developer. Acts as its customer owner, only on operations that list it, and only with the named scope." }, refreshCookie: { type: "apiKey", in: "cookie", name: "expresshub_refresh" } }, schemas: { Error: errorSchema } } };
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
    ...(options.body ? { requestBody: { required: true, content: { [options.multipart ? "multipart/form-data" : "application/json"]: { schema: options.body, example: options.example } } } } : {}) };
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
add("patch", `${prefix}/users/me`, "Update own profile", {user:profile}, {message:"Profile updated successfully",body:{...object({name:str(2),email,phone:{...str(5,30),nullable:true},currentPassword:{...str(1,200),description:"Required only when email changes."},emailNotifications:{type:"boolean",description:"Shipment status emails on or off."}},[]),minProperties:1},example:{name:"Updated Customer",phone:"01700000000"},description:"At least one profile field; unknown fields rejected; email conflicts return 409. emailNotifications turns shipment status emails on or off. Changing email requires currentPassword (400 CURRENT_PASSWORD_REQUIRED or INVALID_CURRENT_PASSWORD otherwise), revokes every other session and sets a fresh refresh cookie for this one."});
add("get", `${prefix}/users`, "List users", {users:[profile],pagination}, {query:userQuery,message:"Users fetched successfully",description:"ADMIN only; soft-deleted users excluded; no password or session fields."});
add("get", `${prefix}/users/{id}`, "Read user profile", {user:profile}, {message:"User fetched successfully",description:"Owner or ADMIN; other users receive 404."});
add("patch", `${prefix}/users/{id}/role`, "Change user role", {user:{...profile,role:"COURIER"}}, {message:"User role updated successfully",body:object({role:roles}),example:{role:"COURIER"},description:"ADMIN only. Cannot change own role. Revokes refresh sessions and atomically audits a real change."});
add("patch", `${prefix}/users/{id}/status`, "Activate or deactivate user", {user:{...profile,isActive:false}}, {message:"User status updated successfully",body:object({isActive:{type:"boolean"}}),example:{isActive:false},description:"ADMIN only; cannot change own status. Deactivation revokes refresh sessions; reactivation does not restore them."});
add("delete", `${prefix}/users/{id}`, "Archive user", {user:{id:id.example,deletedAt:timestamp}}, {message:"User deleted successfully",body:reason,example:{reason:"Archive resolved account"},description:"ADMIN only. Blocks self-deletion, active owned/assigned shipments and unresolved payments/refunds. Revokes sessions; preserves history. Repeat deletion returns 404."});
add("post", `${prefix}/shipments`, "Book shipment", {shipment}, {status:201,message:"Shipment created successfully",body:booking,example:bookingExample,description:"CUSTOMER only. Exactly one effective pricing rule must cover the weight, otherwise 503. Server controls customer, tracking number, status, currency and price. Dimensions must be all supplied or all omitted."});
for (const suffix of ["", "/search", "/my-shipments"]) add("get", `${prefix}/shipments${suffix}`, suffix === "/search" ? "Search shipments" : suffix ? "List own or assigned shipments" : "List visible shipments", {shipments:[shipment],pagination}, {message:"Shipments fetched successfully",query:shipmentQuery.map((p)=>({...p,...(suffix==="/search" && p.name==="q"?{required:true}:{})})),description:"CUSTOMER sees owned, COURIER assigned, ADMIN all non-deleted shipments. On my-shipments ADMIN sees only owned shipments. Filters intersect ownership. Stable ID tie-breaker; offset pagination may shift with concurrent writes."});
const deliveryProof = { recipientName: "Example Recipient", capturedAt: timestamp, hasPhoto: true, hasSignature: true };
add("get", `${prefix}/shipments/{id}`, "Read shipment", {shipment:{...shipment,events:[{id:id.example,type:"CREATED",fromStatus:null,toStatus:"CREATED",publicNote:null,occurredAt:timestamp}],deliveryProof:null}}, {message:"Shipment fetched successfully",description:"Owner CUSTOMER, assigned COURIER or ADMIN. Deleted/inaccessible shipments return 404. Events are ordered by occurredAt ascending, then ID. Customers receive public event fields only; internalNote and actorId are included only for assigned Couriers/Admins."});
add("patch", `${prefix}/shipments/{id}/assign-courier`, "Assign courier", {shipment:{...shipment,courierId:id.example}}, {message:"Courier assigned successfully",body:object({courierId:id,expectedCourierId:{...id,nullable:true}}),example:{courierId:"{{courierId}}",expectedCourierId:null},description:"ADMIN only. Active courier required. CREATED/FAILED only. expectedCourierId must match current assignment; null for first assignment. Concurrent change returns 409."});
add("patch", `${prefix}/shipments/{id}/status`, "Transition shipment", {shipment:{...shipment,status:"CANCELLED"}}, {message:"Shipment updated successfully",body:object({status:statuses,expectedStatus:statuses,note:str(3,1000)},["status","expectedStatus"]),example:{status:"CANCELLED",expectedStatus:"CREATED",note:"Booking no longer needed"},description:"CREATED→PICKED_UP→IN_TRANSIT→OUT_FOR_DELIVERY→DELIVERED or FAILED. ADMIN retries FAILED→IN_TRANSIT or returns FAILED→RETURNED. Owner/ADMIN can cancel CREATED only. Operational transitions require PAID and an active assigned courier. DELIVERED also requires proof of delivery captured by the currently assigned courier (409 PROOF_REQUIRED). DELIVERED/FAILED/RETURNED require a note. Terminal states cannot transition; pending checkout blocks cancellation."});
const binary = (description) => ({ type: "string", format: "binary", description });
add("post", `${prefix}/shipments/{id}/proof`, "Capture proof of delivery", { proof: deliveryProof }, {
  status: 201, message: "Proof of delivery saved", multipart: true, errors: [400, 401, 403, 404, 409, 429, 500, 503],
  body: object({ recipientName: str(2, 100), capturedAt: { ...date, description: "Device capture time for offline uploads. Ignored if more than 5 minutes in the future or older than 7 days." }, photo: binary("JPEG, PNG or WebP, up to 2 MB."), signature: binary("JPEG, PNG or WebP, up to 2 MB.") }, ["recipientName"]),
  example: { recipientName: "Example Recipient", capturedAt: timestamp },
  description: "COURIER only, for a shipment assigned to them that is OUT_FOR_DELIVERY (409 PROOF_NOT_ALLOWED otherwise; other shipments return 404). multipart/form-data with a photo and/or signature (400 PROOF_IMAGE_REQUIRED if neither). Image type is checked from the file bytes; EXIF, XMP, IPTC and text metadata (including GPS location) are removed before storage. Uploading again replaces the earlier proof. Request limit 4.4 MB. Response is a summary; storage keys are never returned.",
});
for (const kind of ["photo", "signature"]) {
  add("get", `${prefix}/shipments/{id}/proof/${kind}`, `Read proof ${kind}`, null, {
    message: `Proof ${kind} image`, errors: [400, 401, 404, 429, 500, 503],
    description: `Returns the ${kind} image bytes (image/jpeg, image/png or image/webp) with Cache-Control: private, max-age=300. Owner CUSTOMER, assigned COURIER or ADMIN; everyone else, and shipments without a ${kind}, receive 404.`,
  });
  const response = spec.paths[`${prefix}/shipments/{id}/proof/${kind}`].get.responses[200];
  response.description = "Image bytes.";
  response.headers["Cache-Control"].schema.example = "private, max-age=300";
  response.content = Object.fromEntries(["image/jpeg", "image/png", "image/webp"].map((type) => [type, { schema: { type: "string", format: "binary" } }]));
}
add("get", `${prefix}/shipments/{id}/label`, "Download shipping label", null, {
  message: "Shipping label PDF", errors: [400, 401, 404, 409, 429, 500, 503],
  description: "Returns a 4 x 6 inch PDF shipping label (application/pdf, Content-Disposition inline with filename expresshub-label-{trackingNumber}.pdf, Cache-Control: private, no-store). It shows the tracking number, sender and recipient name, phone and address, weight, booking date and hubs, and a QR code holding the public tracking link. Owner CUSTOMER, assigned COURIER or ADMIN; everyone else, and archived shipments, receive 404. Cancelled shipments return 409 LABEL_UNAVAILABLE. Characters the standard PDF fonts cannot draw (for example Bangla script) print as '?'. Rate limit: 60 per 15 minutes per user.",
});
{
  const response = spec.paths[`${prefix}/shipments/{id}/label`].get.responses[200];
  response.description = "PDF bytes.";
  response.headers["Cache-Control"].schema.example = "private, no-store";
  response.content = { "application/pdf": { schema: { type: "string", format: "binary" } } };
}
add("get", `${prefix}/courier/shipments/by-tracking/{trackingNumber}`, "Find an assigned shipment by tracking number", { shipment: { id: id.example, trackingNumber: trackingNumber.example, status: "OUT_FOR_DELIVERY" } }, { tag: "courier", message: "Shipment found", errors: [400, 401, 403, 404, 429, 500, 503], description: "COURIER only. Resolves a scanned or typed tracking number (any letter case) to the courier's own non-archived delivery. Shipments assigned to someone else, or unknown numbers, return 404 so parcels cannot be probed. Rate limit: 120 per 15 minutes per courier." });
add("delete", `${prefix}/shipments/{id}`, "Archive shipment", {shipment:{id:id.example,deletedAt:timestamp}}, {message:"Shipment deleted successfully",body:reason,example:{reason:"Archive resolved shipment"},description:"ADMIN only. DELIVERED, RETURNED or CANCELLED only; unresolved payment/refund attempts block archival. Preserves events, payments and audits. Repeat returns 404."});
for (const [method, source, target] of [["get","users","users"],["patch","users/{id}/role","users/{id}/role"],["get","shipments","shipments"]]) {
  const original = operations.find((o)=>o.path===`${prefix}/${source}` && o.method===method);
  add(method, `${prefix}/admin/${target}`, `Admin: ${original.op.summary}`, original.example.data, {...original.options,tag:"admin",description:`ADMIN only. Alias of ${method.toUpperCase()} ${prefix}/${source}; same validation and response. ${original.options.description ?? ""}`});
}
add("get", `${prefix}/admin/dashboard-stats`, "Read dashboard statistics", stats, {description:"ADMIN only. No query parameters. One database snapshot. User/shipment counts exclude deletion; active shipments include FAILED. Payment history is retained; amounts are strings grouped by currency/status, not net revenue or refunded amounts."});
add("get", `${prefix}/courier/stats`, "Read courier statistics", { total: 10, readyPickup: 2, inRoute: 3, delivered: 5, byStatus: { ...counts(statuses.enum), CREATED: 2, IN_TRANSIT: 3, DELIVERED: 5 } }, { tag: "courier", message: "Courier statistics fetched successfully", description: "COURIER or ADMIN only. Aggregates all assigned non-deleted shipments by status." });
// Live courier location
const coordinate = (min, max) => ({ type: "number", minimum: min, maximum: max });
add("post", `${prefix}/courier/location`, "Share live courier location", { activeDeliveries: 2, updatedAt: timestamp }, { tag: "courier", message: "Location updated", body: { ...object({ lat: coordinate(-90, 90), lng: coordinate(-180, 180), accuracy: { ...coordinate(0, 1000), description: "Metres. Fixes worse than 1000 m are rejected." }, heading: { ...coordinate(0, 360), nullable: true }, speed: { ...coordinate(0, 100), nullable: true, description: "Metres per second." } }, ["lat", "lng", "accuracy"]) }, example: { lat: 23.7806, lng: 90.2792, accuracy: 12, heading: 90, speed: 6 }, errors: [400, 401, 403, 409, 429, 500, 503], description: "COURIER only, opt-in from the courier app. Accepted only while the courier has at least one OUT_FOR_DELIVERY shipment; otherwise 409 LOCATION_SHARING_NOT_ALLOWED and any stored position is deleted. Stores only the latest position (one row per courier, no history); it is deleted when the courier's last delivery leaves OUT_FOR_DELIVERY and ignored everywhere after 10 minutes. Rate limit: 240 per 15 minutes per courier." });
add("delete", `${prefix}/courier/location`, "Stop sharing live courier location", { sharing: false }, { tag: "courier", message: "Location sharing stopped", errors: [401, 403, 429, 500, 503], description: "COURIER only. Deletes the courier's stored position." });
add("get", `${prefix}/shipments/{id}/courier-location`, "Read the courier's location for a shipment", { location: { lat: 23.781, lng: 90.279, updatedAt: timestamp, exact: false } }, { tag: "shipments", message: "Courier location fetched", errors: [400, 401, 404, 429, 500, 503], description: "Same access rules as GET /shipments/{id}. location is null unless the shipment is OUT_FOR_DELIVERY with an assigned courier and a position under 10 minutes old. ADMIN and the assigned COURIER get the exact position with accuracy (exact: true); the CUSTOMER gets the public, rounded position (exact: false)." });
add("get", `${prefix}/admin/couriers/live`, "List live courier locations", { couriers: [{ courierId: id.example, name: "Example Courier", lat: 23.7806, lng: 90.2792, accuracy: 12, updatedAt: timestamp, shipments: [{ id: id.example, trackingNumber: trackingNumber.example }] }] }, { tag: "admin", message: "Live couriers fetched", errors: [401, 403, 429, 500, 503], description: "ADMIN only. Active couriers with a position under 10 minutes old, newest first (up to 200), each with up to 20 OUT_FOR_DELIVERY shipments." });
const publicTracking = { trackingNumber: trackingNumber.example, status: "IN_TRANSIT", createdAt: timestamp, deliveredAt: null, events: [{ type: "CREATED", status: "CREATED", occurredAt: timestamp, hub: null }, { type: "HUB_TRANSFER", status: null, occurredAt: timestamp, hub: "Chattogram Hub" }], courierLocation: null };
add("get", `${prefix}/track/{trackingNumber}`, "Track a shipment publicly", { tracking: publicTracking }, { public: true, tag: "track", message: "Tracking fetched successfully", errors: [400, 404, 429, 500, 503], description: "No authentication. Returns only tracking number, status, booking and delivery dates, and public timeline events (booked, status changes, hub transfers with hub name, delivery attempts, cancellation). Never returns names, phones, addresses, price, notes or internal IDs; courier assignment and admin corrections are omitted. courierLocation is {lat, lng, updatedAt} only while the shipment is OUT_FOR_DELIVERY with an assigned courier who shared a position in the last 10 minutes, rounded to 3 decimals (about 110 m); otherwise null. It never includes the courier's identity, accuracy or heading. Soft-deleted or unknown numbers return 404. Rate limit: 60 per 15 minutes per client." });
add("get", `${prefix}/track/{trackingNumber}/stream`, "Stream live tracking updates", { tracking: publicTracking }, { public: true, tag: "track", message: "Server-Sent Events stream", errors: [400, 404, 429, 500, 503], description: "No authentication. Server-Sent Events (text/event-stream). Sends retry, then `event: tracking` with the same public shape as GET /track/{trackingNumber}, then a new tracking event only when the timeline or the courier's public position changes (server checks every 5 seconds). `: heartbeat` comments every 25 seconds. Ends with `event: end` and data {reason}: final (DELIVERED, RETURNED or CANCELLED), gone (shipment removed), error (repeated lookup failures) or timeout (after 270 seconds; reconnect). Rate limit: 30 connections per 15 minutes per client." });
{
  const stream = spec.paths[`${prefix}/track/{trackingNumber}/stream`].get.responses[200];
  stream.description = "Server-Sent Events stream.";
  stream.headers["Cache-Control"].schema.example = "no-cache, no-transform";
  stream.content = { "text/event-stream": { schema: { type: "string" }, example: `retry: 3000\n\nevent: tracking\ndata: ${JSON.stringify(publicTracking)}\n\nevent: end\ndata: {"reason":"final"}\n\n` } };
}
const assistantMessage = { type: "object", properties: { role: enumeration("user", "assistant"), content: { ...str(1, 8000), description: "User messages up to 2000 characters, assistant messages up to 8000." } }, required: ["role", "content"], additionalProperties: false };
add("get", `${prefix}/ai/status`, "Read AI feature availability", { assistant: true, bookingDraft: true, opsBrief: false, dispatch: false, help: true }, { tag: "ai", message: "AI status fetched successfully", description: "Any signed-in user. assistant is true only when AI is enabled on the server and the caller is a CUSTOMER or COURIER; bookingDraft only for a CUSTOMER; opsBrief and dispatch only for an ADMIN; help when AI is enabled, GEMINI_API_KEY is set and help articles are indexed." });
add("get", `${prefix}/ai/help`, "Check help chat availability", { available: true }, { public: true, tag: "ai", message: "Help status fetched", errors: [500], description: "No authentication. available is true when AI is enabled, GEMINI_API_KEY is set (embeddings always use Gemini) and the help articles have been indexed with npm run help:index. Never calls the AI provider." });
add("post", `${prefix}/ai/help`, "Ask the help chat", { help: { answer: "The price is the base fee plus a fee for each extra kilogram above the weight band's minimum, rounded up to whole kilograms.", sources: [{ title: "How prices are calculated", section: "The formula", href: "/help/pricing#the-formula" }], fallback: false } }, {
  public: true, tag: "ai", message: "Help answer prepared",
  body: object({ question: str(3, 500) }),
  example: { question: "How is the price of a shipment calculated?" },
  errors: [400, 413, 429, 502, 503],
  description: "No authentication. Answers one question using only the ExpressHub help articles (docs/help): the question is embedded with Gemini, matched by pgvector similarity and Postgres full-text search, fused with reciprocal rank fusion, and the top 5 sources are sent to the configured provider. Every answer cites the help sections it used (sources link to /help pages); citations must point to sources that were retrieved. When nothing relevant is found or the model is not confident, fallback is true with a fixed message and no sources. Cannot see shipments or accounts. Rate limits: 10 per 15 minutes per client and 300 per day across all visitors (429). 503 AI_UNAVAILABLE when help is off. Audited as AI_HELP_QUERY with a 200-character question excerpt and no actor."
});
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
const dispatchSuggestion = { courierId: id.example, name: "Example Courier", score: 85, reason: "No open shipments · works the Dhaka Central hub · 100% delivered in 30 days", factors: { openShipments: 0, outForDelivery: 0, load: 0, hubMatch: "origin", liveLocation: false, successRate: 1, recentDeliveries: 2 } };
add("post", `${prefix}/admin/dispatch/suggestions`, "Suggest couriers for a waiting shipment", { shipment: { id: id.example, trackingNumber: "EH-0123456789ABCDEF01234567" }, source: "ai", model: "gemini-3.1-flash-lite", notice: null, suggestions: [dispatchSuggestion] }, {
  message: "Dispatch suggestions prepared",
  body: object({ shipmentId: id }, ["shipmentId"]),
  example: { shipmentId: id.example },
  errors: [400, 401, 403, 404, 409],
  description: "ADMIN only. For a PAID shipment with no courier in CREATED or FAILED status, ranks active couriers by rules (capacity 40, origin hub 30 / destination hub 20 / same zone 15, fresh live location 15, 30-day delivery record 15) and, when AI is enabled, lets the provider pick and explain up to three of the top eight. The model sees courier labels (C1..C8) and figures only, never names, emails or phones. Any AI problem, the AI rate limit (20 per 15 minutes per admin) or AI being off returns the rule-based top three with source: rules and notice AI_FAILED, AI_RATE_LIMITED or AI_DISABLED. Never assigns: use PATCH /shipments/{id}/assign-courier. Audited as AI_DISPATCH_SUGGESTION / AI_DISPATCH_SUGGESTION_FAILED with labels, not names. 409 when the shipment already has a courier, is unpaid or can no longer be assigned."
});
add("get", `${prefix}/admin/dispatch/queue`, "List shipments waiting for a courier", { total: 4, shipments: [{ id: id.example, trackingNumber: "EH-0123456789ABCDEF01234567", status: "CREATED", weightKg: 2.5, waitingHours: 5, originHub: "Dhaka Central", destinationHub: null, suggestion: dispatchSuggestion }] }, {
  message: "Dispatch queue fetched",
  errors: [401, 403],
  description: "ADMIN only. The 10 oldest PAID shipments with no courier in CREATED or FAILED status, each with its rule-based top suggestion (null when no courier is active). Never calls the AI provider. total counts every waiting shipment."
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
const failedNotification = { id: id.example, type: "SHIPMENT_DELIVERED", attempts: 5, lastError: "Brevo 503: unavailable", createdAt: timestamp, updatedAt: timestamp, shipment: { id: id.example, trackingNumber: "EH-0123456789ABCDEF01234567" }, recipient: { id: id.example, name: "Example Customer", email: "customer@example.com" } };
add("get", `${prefix}/admin/notifications`, "List failed notification emails", { notifications: [failedNotification], pagination }, { message: "Failed notifications fetched successfully", query: pages, errors: [400, 401, 403, 429, 500, 503], description: "ADMIN only. Shipment emails marked DEAD after 5 failed attempts (or a permanent provider rejection), newest first." });
add("post", `${prefix}/admin/notifications/{id}/retry`, "Retry a failed notification email", { notification: { ...failedNotification, attempts: 0, lastError: null } }, { message: "Notification queued for retry", errors: [400, 401, 403, 404, 409, 429, 500, 503], description: "ADMIN only. Moves a DEAD notification back to PENDING with attempts reset and sends it right after the response. 409 NOTIFICATION_CONFLICT if it is not DEAD. Writes a NOTIFICATION_RETRIED audit record." });
add("post", `${prefix}/admin/notifications/{id}/dismiss`, "Dismiss a failed notification email", { notification: failedNotification }, { message: "Notification dismissed", errors: [400, 401, 403, 404, 409, 429, 500, 503], description: "ADMIN only. Moves a DEAD notification to DISMISSED so it leaves the failed list and is never sent. 409 NOTIFICATION_CONFLICT if it is not DEAD. Writes a NOTIFICATION_DISMISSED audit record." });
add("post", `${prefix}/admin/notifications/dismiss-all`, "Dismiss every failed notification email", { dismissed: 5 }, { message: "Failed notifications dismissed", errors: [401, 403, 429, 500, 503], description: "ADMIN only. Moves every DEAD notification to DISMISSED without sending it and returns how many were dismissed. Writes one NOTIFICATIONS_DISMISSED audit record." });
const scopeList = enumeration("shipments:read", "shipments:write", "webhooks:manage");
const webhookEvents = enumeration("shipment.created", "shipment.status_changed", "shipment.delivered");
const apiKeySummary = { id: id.example, name: "Shop backend", prefix: "a1b2c3d4", scopes: ["shipments:read", "shipments:write"], lastUsedAt: timestamp, expiresAt: null, revokedAt: null, createdAt: timestamp };
const endpointSummary = { id: id.example, url: "https://shop.example.com/expresshub/webhooks", description: "Order system", events: ["shipment.status_changed", "shipment.delivered"], active: true, createdAt: timestamp, updatedAt: timestamp };
const deliverySummary = { id: id.example, eventId: "evt_cm123456789012345678901234_delivered", eventType: "shipment.delivered", shipmentId: id.example, status: "SENT", attempts: 1, nextAttemptAt: timestamp, lastStatusCode: 204, lastError: null, deliveredAt: timestamp, createdAt: timestamp };
const webhookUrlSchema = { ...str(1, 2048), format: "uri", description: "https on port 443, public host only; private, loopback, link-local and metadata addresses are rejected." };
const sessionOnly = "Signed-in CUSTOMER session only; API keys are rejected with 403 API_KEY_NOT_ALLOWED so a key can never create or revoke keys.";
const webhookAuth = "CUSTOMER session, or a merchant API key with the webhooks:manage scope.";
add("get", `${prefix}/developer/api-keys`, "List API keys", { apiKeys: [apiKeySummary] }, { tag: "developer", message: "API keys fetched successfully", errors: [401, 403, 429, 500, 503], description: `${sessionOnly} Returns name, prefix, scopes, last use and expiry; the key itself is never returned again.` });
add("post", `${prefix}/developer/api-keys`, "Create an API key", { apiKey: apiKeySummary, key: "eh_live_a1b2c3d4_<shown-once-secret>" }, { tag: "developer", status: 201, message: "API key created. Copy it now: it will not be shown again.",
  body: { type: "object", properties: { name: str(1, 60), scopes: { type: "array", minItems: 1, uniqueItems: true, items: scopeList }, expiresInDays: { type: "integer", enum: [30, 90, 365], nullable: true } }, required: ["name", "scopes"], additionalProperties: false },
  example: { name: "Shop backend", scopes: ["shipments:read", "shipments:write"], expiresInDays: 365 },
  errors: [400, 401, 403, 409, 429, 500, 503],
  description: `${sessionOnly} The full key (eh_live_<prefix>_<secret>) is returned once and stored only as a SHA-256 hash. Up to 10 active keys; 409 API_KEY_LIMIT beyond that. Writes an API_KEY_CREATED audit record without the key.` });
add("delete", `${prefix}/developer/api-keys/{id}`, "Revoke an API key", { apiKey: { ...apiKeySummary, revokedAt: timestamp } }, { tag: "developer", message: "API key revoked", errors: [400, 401, 403, 404, 429, 500, 503], description: `${sessionOnly} Requests with the key fail with 401 INVALID_API_KEY immediately. Idempotent for already revoked keys.` });
add("get", `${prefix}/developer/webhooks`, "List webhook endpoints", { endpoints: [endpointSummary], available: true }, { tag: "developer", message: "Webhook endpoints fetched successfully", errors: [401, 403, 429, 500, 503], description: `${webhookAuth} available is false when the server has no WEBHOOK_ENCRYPTION_KEY. Signing secrets are never returned.` });
add("post", `${prefix}/developer/webhooks`, "Add a webhook endpoint", { endpoint: endpointSummary, secret: "whsec_<shown-once-secret>" }, { tag: "developer", status: 201, message: "Webhook endpoint created. Copy the signing secret now: it will not be shown again.",
  body: { type: "object", properties: { url: webhookUrlSchema, description: str(0, 200), events: { type: "array", minItems: 1, uniqueItems: true, items: webhookEvents } }, required: ["url", "events"], additionalProperties: false },
  example: { url: "https://shop.example.com/expresshub/webhooks", description: "Order system", events: ["shipment.status_changed", "shipment.delivered"] },
  errors: [400, 401, 403, 409, 429, 500, 503],
  description: `${webhookAuth} The URL is resolved and every address must be public (400 WEBHOOK_URL_INVALID otherwise). The signing secret is encrypted at rest and returned once. Up to 5 endpoints (409 WEBHOOK_LIMIT). 503 WEBHOOKS_UNAVAILABLE without WEBHOOK_ENCRYPTION_KEY. Deliveries are POSTs with ExpressHub-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>, ExpressHub-Event-Id and ExpressHub-Event-Type; any 2xx within 5 seconds counts as delivered, redirects are not followed, and failures retry with backoff for up to 8 attempts.` });
add("patch", `${prefix}/developer/webhooks/{id}`, "Update a webhook endpoint", { endpoint: { ...endpointSummary, active: false } }, { tag: "developer", message: "Webhook endpoint updated",
  body: { type: "object", properties: { url: webhookUrlSchema, description: { ...str(0, 200), nullable: true }, events: { type: "array", minItems: 1, uniqueItems: true, items: webhookEvents }, active: { type: "boolean" } }, minProperties: 1, additionalProperties: false },
  example: { active: false }, errors: [400, 401, 403, 404, 429, 500, 503], description: `${webhookAuth} A new URL is vetted like on creation. Disabled endpoints receive nothing; queued deliveries for them are marked DEAD.` });
add("delete", `${prefix}/developer/webhooks/{id}`, "Delete a webhook endpoint", { id: id.example }, { tag: "developer", message: "Webhook endpoint deleted", errors: [400, 401, 403, 404, 429, 500, 503], description: `${webhookAuth} Also deletes the endpoint's delivery log.` });
add("post", `${prefix}/developer/webhooks/{id}/rotate-secret`, "Rotate a webhook signing secret", { endpoint: endpointSummary, secret: "whsec_<shown-once-secret>" }, { tag: "developer", message: "Signing secret rotated. Copy it now: it will not be shown again.", errors: [400, 401, 403, 404, 429, 500, 503], description: `${webhookAuth} The old secret stops being used immediately.` });
add("post", `${prefix}/developer/webhooks/{id}/test`, "Send a test webhook", { delivery: { ...deliverySummary, eventType: "webhook.test", shipmentId: null, status: "PENDING", attempts: 0, lastStatusCode: null, deliveredAt: null } }, { tag: "developer", status: 202, message: "Test event queued", errors: [400, 401, 403, 404, 429, 500, 503], description: `${webhookAuth} Queues a signed webhook.test event and sends it right after the response.` });
add("get", `${prefix}/developer/webhooks/{id}/deliveries`, "List webhook deliveries", { deliveries: [deliverySummary], pagination }, { tag: "developer", message: "Webhook deliveries fetched successfully", query: [...pages, query("status", enumeration("PENDING", "SENT", "FAILED", "DEAD"), "Optional status filter.")], errors: [400, 401, 403, 404, 429, 500, 503], description: `${webhookAuth} Newest first, with attempts, the last response code and error, and the next retry time.` });
add("post", `${prefix}/developer/webhook-deliveries/{id}/retry`, "Retry a failed webhook delivery", { delivery: { ...deliverySummary, status: "PENDING", attempts: 0, lastError: null } }, { tag: "developer", message: "Delivery queued for retry", errors: [400, 401, 403, 404, 409, 429, 500, 503], description: `${webhookAuth} Moves a DEAD delivery back to PENDING with attempts reset. 409 WEBHOOK_DELIVERY_CONFLICT if it is not DEAD; 404 for another customer's delivery.` });
const calendarDay = { type: "string", format: "date", example: "2026-11-01" };
const analyticsQuery = [
  query("from", calendarDay, "Inclusive Bangladesh calendar date. Send with to, or omit both for the last 30 days."),
  query("to", { ...calendarDay, example: "2026-11-30" }, "Inclusive Bangladesh calendar date. At most 366 days after from."),
  query("granularity", { ...enumeration("day", "week"), default: "day" }, "Bucket size; weeks start on Monday."),
];
const analyticsSummary = { booked: 42, delivered: 35, failed: 3, revenue: "12450.50", onTimeRate: 88.6, failureRate: 7.9, medianDeliveryHours: 26.5, p90DeliveryHours: 61.2 };
const analytics = {
  range: { from: "2026-11-01", to: "2026-11-30", days: 30, granularity: "day", timeZone: "Asia/Dhaka", previousFrom: "2026-10-02", previousTo: "2026-10-31" },
  currency: "BDT", onTimeHours: 72,
  summary: analyticsSummary,
  previous: { ...analyticsSummary, booked: 36, delivered: 30, revenue: "10100.00", onTimeRate: 84.2 },
  change: { booked: 16.7, delivered: 16.7, revenue: 23.3, onTimeRate: 4.4, failureRate: -1.2, medianDeliveryHours: -2.1 },
  series: [{ period: "2026-11-01", booked: 2, delivered: 1, revenue: "450.00" }],
  hubs: [{ name: "Dhaka Central Hub", shipments: 18 }],
  couriers: [{ id: id.example, name: "Karim", deliveries: 20, failed: 1, onTimeRate: 90 }],
  generatedAt: timestamp, cached: false,
};
add("get", `${prefix}/admin/analytics`, "Read business analytics", { analytics }, { message: "Analytics fetched successfully", query: analyticsQuery, errors: [400, 401, 403, 429, 500, 503], description: "ADMIN only. Aggregated in SQL with Asia/Dhaka day boundaries. booked counts non-deleted shipments created in the range; delivered counts deliveries in the range; revenue is BDT received (paidAt) minus full refunds (refundedAt) as a decimal string, including payments for archived shipments. onTimeRate is the share of deliveries within 72 hours of first pickup (deliveries without a recorded pickup are not timed); median and p90 delivery hours use the same times. failureRate is failed / (delivered + failed). previous is the same number of days immediately before; change is a percentage for booked, delivered and revenue, and a difference in points or hours for the rest. Top 5 origin hubs and up to 10 couriers. Cached for 5 minutes per range (cached: true when served from cache)." });
add("get", `${prefix}/admin/analytics/export`, "Export analytics as CSV", { export: { filename: "expresshub-analytics-2026-11-01-to-2026-11-30.csv", contentType: "text/csv; charset=utf-8", content: "Period starting,Shipments booked,Shipments delivered,Net revenue (BDT)\r\n2026-11-01,2,1,450.00\r\n" } }, { message: "Analytics export prepared", query: analyticsQuery, errors: [400, 401, 403, 429, 500, 503], description: "ADMIN only. Same range rules as GET /admin/analytics. Returns the per-bucket series as CSV text inside the JSON envelope, so it works with bearer-token auth; save content as filename. Text cells that could run as spreadsheet formulas are prefixed with an apostrophe." });
for (const method of ["get", "post"]) add(method, `${prefix}/internal/notifications/dispatch`, "Send due notification emails", { summary: { claimed: 3, sent: 2, skipped: 0, retrying: 1, dead: 0 } }, { public: true, tag: "internal", message: "Notifications dispatched", errors: [401, 500, 503], headers: [{ name: "Authorization", in: "header", required: true, schema: { type: "string" }, description: "Bearer CRON_SECRET (at least 16 characters). Vercel Cron sends it automatically." }], description: "Scheduler-only retry sweeper; no user token. Claims due outbox rows with FOR UPDATE SKIP LOCKED (safe to run concurrently), sends up to 5 batches of 20, retries failures with exponential backoff and marks rows DEAD after 5 attempts. Status changes also trigger a send right after their response." });
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
// Operations a merchant API key may call (mirrors API_KEY_ROUTES in lib/merchant/api-keys.ts).
const apiKeyOperations = {
  "get /api/v1/shipments": "shipments:read", "get /api/v1/shipments/{id}": "shipments:read",
  "get /api/v1/shipments/my-shipments": "shipments:read", "get /api/v1/shipments/search": "shipments:read",
  "post /api/v1/shipments": "shipments:write", "patch /api/v1/shipments/{id}/status": "shipments:write",
  "get /api/v1/developer/webhooks": "webhooks:manage", "post /api/v1/developer/webhooks": "webhooks:manage",
  "patch /api/v1/developer/webhooks/{id}": "webhooks:manage", "delete /api/v1/developer/webhooks/{id}": "webhooks:manage",
  "post /api/v1/developer/webhooks/{id}/rotate-secret": "webhooks:manage", "post /api/v1/developer/webhooks/{id}/test": "webhooks:manage",
  "get /api/v1/developer/webhooks/{id}/deliveries": "webhooks:manage", "post /api/v1/developer/webhook-deliveries/{id}/retry": "webhooks:manage",
};
for (const operation of operations) {
  const scope = apiKeyOperations[`${operation.method} ${operation.path}`];
  if (!scope) continue;
  operation.op.security = [{ bearerAuth: [] }, { merchantApiKey: [] }];
  operation.op.description = `${operation.op.description} Also accepts a merchant API key with the ${scope} scope (rate limited to 120 requests per minute per key); keys act with CUSTOMER rights.`.trim();
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
const collection = { info:{name:"ExpressHub API",schema:"https://schema.getpostman.com/json/collection/v2.1.0/collection.json",description:"Run individual requests in the documented workflow; do not run the whole collection against production. Set credentials locally, use the cookie jar, and switch accessToken for the required role. No secrets are included."},auth:{type:"bearer",bearer:[{key:"token",value:"{{accessToken}}",type:"string"}]},variable:[{key:"baseUrl",value:"http://localhost:3000"},...['accessToken','email','password','userId','shipmentId','courierId','trackingNumber','apiKeyId','webhookId','deliveryId'].map(key=>({key,value:""}))],item:[] };
for (const {method,path,op,options,example,status} of operations) {
  const groupName=op.tags[0];let group=collection.item.find(g=>g.name===groupName);
  if(!group){group={name:groupName,item:[]};collection.item.push(group);}
  const resource=path.includes("/users/")?"userId":path.includes("/payments/")?"paymentId":path.includes("/developer/api-keys/")?"apiKeyId":path.includes("/developer/webhooks/")?"webhookId":path.includes("/webhook-deliveries/")?"deliveryId":"shipmentId";
  const urlPath=path.replace("{id}",`{{${resource}}}`).replace("{trackingNumber}","{{trackingNumber}}");
  const queryParams=(options.query??[]).map(p=>({key:p.name,value:String(p.schema.default??(p.name==='q'?'Dhaka':'')),disabled:!p.required,description:p.description}));
  const request={method:method.toUpperCase(),header:[...(op.requestBody&&!options.multipart?[{key:"Content-Type",value:"application/json"}]:[]),...(options.headers??[]).map(p=>({key:p.name,value:p.name==="Idempotency-Key"?"{{idempotencyKey}}":"{{stripeSignature}}"}))],url:{raw:`{{baseUrl}}${urlPath}${queryParams.some(p=>!p.disabled)?'?'+queryParams.filter(p=>!p.disabled).map(p=>`${p.key}=${p.value}`).join('&'):''}`,host:["{{baseUrl}}"],path:urlPath.slice(1).split("/"),...(queryParams.length?{query:queryParams}:{})},description:op.description,
    ...(options.public||options.cookieAuth?{auth:{type:"noauth"}}:{}),...(op.requestBody?(options.multipart?{body:{mode:"formdata",formdata:Object.entries(options.body.properties).map(([key,schema])=>schema.format==="binary"?{key,type:"file",src:"",description:schema.description}:{key,type:"text",value:String(options.example?.[key]??""),description:schema.description})}}:{body:{mode:"raw",raw:JSON.stringify(options.example??op.requestBody.content["application/json"].example,null,2),options:{raw:{language:"json"}}}}):{})};
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
