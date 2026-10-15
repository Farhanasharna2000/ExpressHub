import type { NextRequest } from "next/server";
import { refundPayment } from "@/services/payment.controller";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return refundPayment(request, context);
}
