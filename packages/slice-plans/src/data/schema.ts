import { bigintAsString, timestampConfig } from "@chatbotx.io/database/partials"
import { workspaceModel } from "@chatbotx.io/database/schema"
import {
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/**
 * Konversify enterprise layer — plans and billing (S6, Contract 5).
 *
 * Mirrors the E1 spine conventions: `ent` schema, tenant identity is the MIT
 * Workspace row, workspace-keyed tables carry RLS on `app.workspace_id`.
 * `plan` and `ls_event` are server-side reference/audit tables with no
 * workspace column, so they take no RLS policy (S1-AUDIT §5).
 */
export const plansSchema = pgSchema("ent")

export const subscriptionStatuses = [
  "active",
  "trial",
  "past_due",
  "expired",
  "canceled",
] as const
export type SubscriptionStatus = (typeof subscriptionStatuses)[number]

/** Which plan a subscription row currently grants; effective resolution adds trial read-time checks. */
export const planModel = plansSchema.table("plan", {
  key: text().primaryKey(),
  name: text().notNull(),
  workspacesLimit: integer().notNull(),
  channelsLimit: integer().notNull(),
  membersLimit: integer().notNull(),
  contactsLimit: integer().notNull(),
  botMessagesLimit: integer().notNull(),
  features: jsonb().$type<string[]>().notNull().default([]),
  monthlyPriceCents: integer().notNull().default(0),
  trialDays: integer().notNull().default(0),
  // Filled by the orchestrator once the LS product exists (EXEC-TRACKS "LS state"); NULL until then.
  lsVariantId: text(),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
})

export const tenantSubscriptionModel = plansSchema.table(
  "tenant_subscription",
  {
    workspaceId: bigintAsString()
      .primaryKey()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    planKey: text()
      .notNull()
      .references(() => planModel.key),
    status: text().$type<SubscriptionStatus>().notNull().default("active"),
    trialEndsAt: timestamp(timestampConfig),
    periodStart: timestamp(timestampConfig),
    periodEnd: timestamp(timestampConfig),
    lsCustomerId: text(),
    lsSubscriptionId: text(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
)

export const tenantUsageModel = plansSchema.table("tenant_usage", {
  workspaceId: bigintAsString()
    .primaryKey()
    .references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  botMessagesUsed: integer().notNull().default(0),
  botMessagesPeriodStart: timestamp(timestampConfig),
  updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
})

export const lsEventModel = plansSchema.table(
  "ls_event",
  {
    eventId: text().primaryKey(),
    eventName: text().notNull(),
    workspaceId: bigintAsString().references(() => workspaceModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    processedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("ls_event_event_id_key").on(table.eventId)],
)
