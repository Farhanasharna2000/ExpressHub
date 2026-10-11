import { NextResponse, type NextRequest } from "next/server";
import { successResponse } from "@/lib/http/responses";

export const runtime = "nodejs";

// A browser redirect is not evidence of payment. Settlement only uses webhooks.
export async function GET(request: NextRequest) {
  const accept = request.headers?.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const url = new URL(request.url);
    const dest = new URL("/checkout/success", url.origin);
    dest.search = url.search;
    return NextResponse.redirect(dest, 303);
  }

  return successResponse(
    "Checkout returned. Check your authenticated payment status for confirmation.",
    {
      checkout: "returned",
      paymentConfirmed: false,
    },
  );
}
