import type { NextRequest } from "next/server";
import { proofImageResponse } from "@/lib/http/proof-image-route";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return proofImageResponse(request, context.params, "signature");
}
