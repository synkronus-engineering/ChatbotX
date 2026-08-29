import { provisionWorkspace } from "@chatbotx.io/slice-tenancy"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { name, ownerEmail, plan, locale } = await req.json()

    if (!(name && ownerEmail)) {
      return NextResponse.json(
        { error: "name and ownerEmail are required" },
        { status: 400 },
      )
    }

    const result = await provisionWorkspace({
      name,
      ownerEmail,
      plan,
      locale,
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provisioning failed" },
      { status: 500 },
    )
  }
}
