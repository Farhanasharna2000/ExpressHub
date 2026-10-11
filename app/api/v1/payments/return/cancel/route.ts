import { NextResponse, type NextRequest } from "next/server";
import { successResponse } from "@/lib/http/responses";

export const runtime = "nodejs";

// Leaving Checkout does not expire the session or cancel the shipment.
export async function GET(request: NextRequest) {
  const accept = request.headers?.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const url = new URL(request.url);
    const dest = new URL("/checkout/cancel", url.origin);
    dest.search = url.search;
    return NextResponse.redirect(dest, 303);
  }

  return successResponse(
    "Checkout was left without confirmation. The payment session may still be open.",
    {
      checkout: "cancelled",
      paymentConfirmed: false,
    },
  );
}
