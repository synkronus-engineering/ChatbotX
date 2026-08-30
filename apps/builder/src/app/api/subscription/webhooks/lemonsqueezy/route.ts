import {
  applyWebhookEvent,
  keys,
  MalformedWebhookError,
  parseWebhookEvent,
  recordEventOnce,
  verifyWebhookSignature,
} from "@chatbotx.io/slice-plans"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

/**
 * Lemon Squeezy webhook (PLAN-C task 4, BaseLine route flow): verify the
 * exact raw body against `x-signature` (401 on any mismatch), dedup via
 * ent.ls_event, apply inline. After verification this route ALWAYS answers
 * 200 — a processing failure returns `status: "deferred"` so LS retries on
 * its schedule instead of retry-storming a 5xx loop.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = keys().LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    logger.error("lemonsqueezy webhook: LEMONSQUEEZY_WEBHOOK_SECRET unset")
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    )
  }

  const rawBody = await req.text()
  const signature = req.headers.get("x-signature")

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event
  try {
    event = parseWebhookEvent(rawBody)
  } catch (err) {
    if (err instanceof MalformedWebhookError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const firstInsert = await recordEventOnce({
    eventId: event.eventId,
    eventName: event.eventName,
    workspaceId: event.custom?.workspace_id ?? null,
  })
  if (!firstInsert) {
    return NextResponse.json({ received: true, status: "duplicate" })
  }

  try {
    const result = await applyWebhookEvent(event)
    return NextResponse.json({
      received: true,
      status: result.applied ? "applied" : "skipped",
    })
  } catch (err) {
    logger.error(
      { err, eventId: event.eventId, eventName: event.eventName },
      "lemonsqueezy webhook: apply failed (deferred)",
    )
    return NextResponse.json({ received: true, status: "deferred" })
  }
}
