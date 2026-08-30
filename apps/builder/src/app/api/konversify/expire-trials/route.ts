import { expireEndedTrials, keys } from "@chatbotx.io/slice-plans"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

/**
 * Trial-expiry sweep for the server cron (PLAN-C task 6). Read-time
 * resolution already downgrades expired trials to the free plan — this only
 * corrects the stored status for accurate UI; no in-repo cron exists.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = keys().KONVERSIFY_EXPIRE_SECRET
  if (!secret) {
    logger.error("expire-trials: KONVERSIFY_EXPIRE_SECRET unset")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  const provided = req.headers.get("x-expire-secret")
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const expired = await expireEndedTrials()
  return NextResponse.json({ expired })
}
