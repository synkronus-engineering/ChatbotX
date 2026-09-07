import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SECRET_HEADER = "x-console-secret"

/**
 * Timing-safe shared-secret gate. Unset secrets fail closed (401) so an
 * unconfigured console is unreachable rather than open.
 */
function authorize(req: NextRequest): boolean {
  const expected = process.env.CONSOLE_API_SECRET
  const provided = req.headers.get(SECRET_HEADER) ?? ""
  if (!expected) {
    console.error("console api: CONSOLE_API_SECRET is not configured")
    return false
  }
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

// The secret-gated handlers read the DB per request; without this, Next
// prerenders GET at build time and serves a static response that bypasses
// the auth check entirely.
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
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
  } catch (err) {
    // A silent [] here would read as "no tenants" and hide real breakage.
    console.error("console api: listing workspaces failed", err)
    return NextResponse.json({ error: "Listing failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const client = await pool.connect()
  try {
    const { name, ownerEmail, plan = "free", locale = "es" } = await req.json()
    if (!(name && ownerEmail)) {
      return NextResponse.json(
        { error: "name and ownerEmail required" },
        { status: 400 },
      )
    }

    // Workspace + member + meta is one unit: a failure between the inserts
    // would strand a Workspace with no owner membership.
    await client.query("BEGIN")

    const { rows: users } = await client.query(
      `SELECT id::text FROM "User" WHERE email = $1 LIMIT 1`,
      [ownerEmail],
    )
    if (users.length === 0) {
      await client.query("ROLLBACK")
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
      await client.query("ROLLBACK")
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
       VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM "WorkspaceMember"), $1, $2, 'owner', now(), now(), $3::jsonb, $4::jsonb, $5::jsonb)`,
      [
        workspaceId,
        ownerId,
        // Owner grants every permission flag — hasWorkspacePermission fails
        // closed on missing keys, so the column default {} would lock the
        // owner out of every permission-gated /space route (the exact bug
        // that 404'd E1-provisioned workspaces). Mirrors workspaceService.create.
        JSON.stringify({
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: true,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        }),
        JSON.stringify({
          notifyAdmin: true,
          newMessageToHuman: true,
          newOrder: true,
        }),
        JSON.stringify({
          messenger: true,
          email: true,
          telegram: true,
          browser: true,
        }),
      ],
    )

    await client.query(
      `INSERT INTO ent.workspace_meta ("workspaceId", plan, locale)
       VALUES ($1::bigint, $2, $3) ON CONFLICT DO NOTHING`,
      [workspaceId, plan, locale],
    )

    await client.query("COMMIT")
    return NextResponse.json({ workspaceId, created: true })
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined)
    console.error("console api: provisioning failed", err)
    return NextResponse.json({ error: "Provisioning failed" }, { status: 500 })
  } finally {
    client.release()
  }
}
