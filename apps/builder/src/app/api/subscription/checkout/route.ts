import { workspaceService } from "@chatbotx.io/business"
import {
  createLsCheckout,
  getPlanByKey,
  PLAN_KEYS,
  resolveEffectivePlan,
} from "@chatbotx.io/slice-plans"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { env } from "@/env"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

interface CheckoutBody {
  workspaceId?: unknown
}

/**
 * Owner-only upgrade checkout (PLAN-C task 4). Always targets Pro; the free
 * plan has nothing to buy and an already-active Pro subscription is a 409
 * (BaseLine parity). Until the LS product exists and ent.plan.ls_variant_id
 * is filled, returns 503 with the reason (EXEC-TRACKS §LS state).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: CheckoutBody
  try {
    body = (await req.json()) as CheckoutBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId : ""
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 },
    )
  }

  const workspace = await workspaceService.findById({ id: workspaceId })
  if (workspace.ownerId !== userId) {
    return NextResponse.json(
      { error: "Only the workspace owner can start a checkout" },
      { status: 403 },
    )
  }

  const state = await resolveEffectivePlan(workspaceId)
  if (
    state.subscription &&
    state.effectivePlanKey === PLAN_KEYS.pro &&
    state.subscription.status === "active"
  ) {
    return NextResponse.json(
      { error: "Pro subscription already active" },
      { status: 409 },
    )
  }

  const pro = await getPlanByKey(PLAN_KEYS.pro)
  if (!pro) {
    return NextResponse.json({ error: "Pro plan not found" }, { status: 500 })
  }
  if (!pro.lsVariantId) {
    return NextResponse.json(
      {
        error:
          "Checkout unavailable: Lemon Squeezy variant not configured yet (ent.plan.ls_variant_id is NULL)",
      },
      { status: 503 },
    )
  }

  try {
    const session = await createLsCheckout({
      variantId: pro.lsVariantId,
      workspaceId,
      monthlyPriceCents: pro.monthlyPriceCents,
      planName: pro.name,
      redirectUrl: `${env.NEXT_PUBLIC_BUILDER_URL}/space/${workspaceId}/dashboard`,
    })
    return NextResponse.json(session)
  } catch (err) {
    logger.error({ err, workspaceId }, "subscription checkout failed")
    return NextResponse.json({ error: "Checkout failed" }, { status: 502 })
  }
}
