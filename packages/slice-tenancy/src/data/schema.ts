import { bigintAsString, pgSchema, text, timestamp } from "drizzle-orm/pg-core"

/**
 * Konversify enterprise layer — tenancy spine (E1).
 *
 * Tenant identity in our layer is the MIT-licensed Workspace row
 * (`packages/database/src/schema/workspace.ts`). The vendor's commercial
 * Tenant/quota schema is intentionally unused. Every table here is keyed by
 * workspace_id and protected by RLS on `app.workspace_id`.
 */
export const ent = pgSchema("ent")

export const workspaceMetaModel = ent.table("workspace_meta", {
  workspaceId: bigintAsString("workspace_id").primaryKey(),
  plan: text().notNull().default("free"),
  locale: text().notNull().default("es"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
})

export const isolationProbeModel = ent.table("isolation_probe", {
  id: bigintAsString("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: bigintAsString("workspace_id").notNull(),
  payload: text().notNull(),
})
