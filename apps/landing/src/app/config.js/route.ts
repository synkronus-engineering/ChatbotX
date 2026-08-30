import { NextResponse } from "next/server"

/**
 * Runtime public config: NEXT_PUBLIC_* values are baked at image build time,
 * but the image is built once by CI and promoted across environments — so the
 * builder origin is read from the server env on each request and handed to the
 * client bundle here, before any client module evaluates.
 */
export function GET(): NextResponse {
  const builderUrl = process.env.NEXT_PUBLIC_BUILDER_URL ?? ""
  const body = `window.__KONVERSIFY__ = { builderUrl: ${JSON.stringify(builderUrl)} };`
  return new NextResponse(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}
