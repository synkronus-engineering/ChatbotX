import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT wm."workspaceId"::text AS workspace_id, w.name, u.email as owner_email,
              wm.plan, wm.locale, wm."suspendedAt"::text AS suspended_at
       FROM ent.workspace_meta wm
       JOIN "Workspace" w ON w.id = wm."workspaceId"
       JOIN "User" u ON u.id = w."ownerId"
       ORDER BY w.name`,
    )
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: Request) {
  const client = await pool.connect()
  try {
    const { name, ownerEmail, plan = "free", locale = "es" } = await req.json()
    if (!(name && ownerEmail)) {
      return NextResponse.json(
        { error: "name and ownerEmail required" },
        { status: 400 },
      )
    }

    const { rows: users } = await client.query(
      `SELECT id::text FROM "User" WHERE email = $1 LIMIT 1`,
      [ownerEmail],
    )
    if (users.length === 0) {
      return NextResponse.json(
        { error: `Owner ${ownerEmail} not found` },
        { status: 404 },
      )
    }
    const ownerId = users[0].id

    const { rows: existing } = await client.query(
      `SELECT id::text FROM "Workspace" WHERE "ownerId" = $1 LIMIT 1`,
      [ownerId],
    )
    if (existing.length > 0) {
      return NextResponse.json({ workspaceId: existing[0].id, created: false })
    }

    const { rows: ws } = await client.query(
      `INSERT INTO "Workspace" (id, name, "ownerId", "tenantId", "createdAt", "updatedAt", language, timezone, "brandColor", "developmentMode", "isActive")
       VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM "Workspace"), $1, $2, 1, now(), now(), $3, 'UTC', '#016DFF', false, true)
       RETURNING id::text`,
      [name, ownerId, locale],
    )
    const workspaceId = ws[0].id

    await client.query(
      `INSERT INTO "WorkspaceMember" (id, "workspaceId", "userId", role, "createdAt", "updatedAt", permissions, "notificationTypes", "notificationChannels")
       VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM "WorkspaceMember"), $1, $2, 'owner', now(), now(), '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [workspaceId, ownerId],
    )

    await client.query(
      `INSERT INTO ent.workspace_meta ("workspaceId", plan, locale)
       VALUES ($1::bigint, $2, $3) ON CONFLICT DO NOTHING`,
      [workspaceId, plan, locale],
    )

    return NextResponse.json({ workspaceId, created: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provisioning failed" },
      { status: 500 },
    )
  } finally {
    client.release()
  }
}
