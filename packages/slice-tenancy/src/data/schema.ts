import { bigintAsString, timestampConfig } from "@chatbotx.io/database/partials"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { pgSchema, text, timestamp } from "drizzle-orm/pg-core"

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
  workspaceId: bigintAsString()
    .primaryKey()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  plan: text().notNull().default("free"),
  locale: text().notNull().default("es"),
  suspendedAt: timestamp(timestampConfig),
})

export const isolationProbeModel = ent.table("isolation_probe", {
  id: bigintAsString()
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: bigintAsString()
    .notNull()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  payload: text().notNull(),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
})
