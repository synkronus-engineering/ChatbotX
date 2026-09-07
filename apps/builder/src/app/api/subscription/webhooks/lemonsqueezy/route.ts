import type { ParsedWebhookEvent } from "@chatbotx.io/slice-plans"
import {
  keys,
  MalformedWebhookError,
  parseWebhookEvent,
  processWebhookEvent,
  verifyWebhookSignature,
} from "@chatbotx.io/slice-plans"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/log"

const NUMERIC_ID = /^\d+$/

/**
 * Lemon Squeezy webhook (BaseLine route flow, hardened per review P0 #2):
 * verify the exact raw body against `x-signature` (401 on any mismatch),
 * then record+apply the event in ONE transaction. An apply failure rolls the
 * dedup row back with the subscription write and this route answers 5xx —
 * LS retries non-2xx deliveries, and the retried event re-inserts cleanly
 * instead of hitting a permanent "duplicate" wall. The 200-without-apply
 * paths are benign: unhandled event names, duplicates whose original apply
 * completed, test/live mode mismatches, and events whose workspace cannot
 * be resolved yet (dead-lettered with `appliedAt` NULL for the replay sweep).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = keys()
  const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET
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

  let event: ParsedWebhookEvent
  try {
    event = parseWebhookEvent(rawBody)
  } catch (err) {
    if (err instanceof MalformedWebhookError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const customWorkspaceId = event.custom?.workspace_id
  if (customWorkspaceId !== undefined && !NUMERIC_ID.test(customWorkspaceId)) {
    logger.warn(
      { eventId: event.eventId, customWorkspaceId },
      "lemonsqueezy webhook: malformed custom_data.workspace_id",
    )
    return NextResponse.json(
      { error: "Malformed workspace id" },
      { status: 400 },
    )
  }

  if (
    event.testMode !== undefined &&
    event.testMode !== (env.LEMONSQUEEZY_MODE === "test")
  ) {
    logger.warn(
      { eventId: event.eventId, testMode: event.testMode },
      "lemonsqueezy webhook: test_mode disagrees with LEMONSQUEEZY_MODE — skipped",
    )
    return NextResponse.json({ received: true, status: "mode-mismatch" })
  }

  try {
    const result = await processWebhookEvent(event, rawBody)
    return NextResponse.json({ received: true, status: result.status })
  } catch (err) {
    logger.error(
      { err, eventId: event.eventId, eventName: event.eventName },
      "lemonsqueezy webhook: processing failed — answering 500 so LS retries",
    )
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    )
  }
}
