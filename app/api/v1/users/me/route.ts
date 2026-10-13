import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody, setPageSessionCookie } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";
import { getUserProfile, updateProfile } from "@/services/user.service";
import { updateProfileSchema } from "@/validators/user";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const user = await getUserProfile(actor, actor.id);
    const response = successResponse("Profile fetched successfully", { user });
    setPageSessionCookie(response, { userId: user.id, role: user.role });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const input = await parseRequestBody(request, updateProfileSchema, 300 * 1024);
    const user = await updateProfile(actor, input);
    const response = successResponse("Profile updated successfully", { user });
    setPageSessionCookie(response, { userId: user.id, role: user.role });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
