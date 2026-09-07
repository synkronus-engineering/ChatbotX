import { timingSafeEqual } from "node:crypto"
import {
  expireEndedTrials,
  keys,
  replayUnappliedEvents,
} from "@chatbotx.io/slice-plans"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

/**
 * Maintenance sweep for the server cron (PLAN-C task 6): flips ended trials
 * to `expired` (read-time resolution already downgraded the effective plan —
 * this corrects the stored status for accurate UI) and replays webhook
 * events whose apply never completed (`appliedAt` NULL dead-letters).
 * Timing-safe secret compare; no in-repo cron exists.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = keys().KONVERSIFY_EXPIRE_SECRET
  if (!secret) {
    logger.error("maintenance sweep: KONVERSIFY_EXPIRE_SECRET unset")
    return NextResponse.json({ error: "Not configured" }, { status: 500 })
  }

  const provided = req.headers.get("x-expire-secret") ?? ""
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided)
  const authorized =
    expected.length === actual.length && timingSafeEqual(expected, actual)
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [expired, replayed] = await Promise.all([
    expireEndedTrials(),
    replayUnappliedEvents(),
  ])
  return NextResponse.json({ expired, replayed })
}
