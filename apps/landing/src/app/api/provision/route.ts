import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const PROVISION_TIMEOUT_MS = 15_000

export async function POST(req: NextRequest): Promise<NextResponse> {
  const builderUrl = process.env.NEXT_PUBLIC_BUILDER_URL
  if (!builderUrl) {
    return NextResponse.json(
      { error: "Landing is missing NEXT_PUBLIC_BUILDER_URL" },
      { status: 500 },
    )
  }

  const body = await req.text()
  const cookie = req.headers.get("cookie")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS)
  try {
    const upstream = await fetch(`${builderUrl}/api/konversify/provision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body,
      signal: controller.signal,
    })

    const payload = await upstream.text()
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    })
  } catch {
    return NextResponse.json(
      { error: "Provisioning unavailable" },
      {
        status: 502,
      },
    )
  } finally {
    clearTimeout(timeout)
  }
}
