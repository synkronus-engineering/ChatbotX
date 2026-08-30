import { workspaceService } from "@chatbotx.io/business"
import {
  assertWorkspaceCapacity,
  createSubscriptionOnProvision,
  PlanCapacityError,
} from "@chatbotx.io/slice-plans"
import { provisionWorkspace } from "@chatbotx.io/slice-tenancy"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

interface ProvisionBody {
  businessName?: unknown
}

/**
 * Landing sign-up completion (PLAN-C task 4): creates the caller's workspace
 * through the slice-tenancy seam and stamps the ent.tenant_subscription
 * trial row (Pro trial, 14 days). Idempotent — an owner with an existing
 * workspace gets that workspace back with its subscription ensured.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: ProvisionBody
  try {
    body = (await req.json()) as ProvisionBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const businessName =
    typeof body.businessName === "string" ? body.businessName.trim() : ""
  if (!businessName || businessName.length > 100) {
    return NextResponse.json(
      { error: "businessName (1-100 chars) is required" },
      { status: 400 },
    )
  }

  // Belt over the workspaceService gate: a friendly, machine-readable 402
  // before any rows are written (the funnel normally sees 0 owned here).
  const owned = await workspaceService.find({ where: { ownerId: userId } })
  if (!owned) {
    try {
      await assertWorkspaceCapacity(userId)
    } catch (err) {
      if (err instanceof PlanCapacityError) {
        return NextResponse.json(
          { error: "Workspace limit reached for your plan" },
          { status: 402 },
        )
      }
      throw err
    }
  }

  try {
    const result = await provisionWorkspace({
      ownerId: userId,
      name: businessName,
    })

    await createSubscriptionOnProvision(result.workspaceId)

    return NextResponse.json({
      workspaceId: result.workspaceId,
      created: result.created,
    })
  } catch (err) {
    logger.error({ err, userId }, "konversify provision failed")
    return NextResponse.json({ error: "Provisioning failed" }, { status: 500 })
  }
}
