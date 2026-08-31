import { readFileSync } from "node:fs"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { PLAN_SEEDS } from "../data/plans"
import {
  lsEventModel,
  planModel,
  tenantSubscriptionModel,
  tenantUsageModel,
} from "../data/schema"

const MIGRATION_PATH =
  "../../../database/drizzle/20260830120000_slice_plans_ent/migration.sql"
const CORRECTIVE_PATH =
  "../../../database/drizzle/20260831230000_slice_ent_camel_columns/migration.sql"

/**
 * Follows the E1 slice-tenancy test approach: schema-shape asserts plus
 * migration-content checks for the workspace-keyed RLS pattern (the live-DB
 * RLS integration suite lands with the shared testcontainer infrastructure).
 */
describe("schema shape", () => {
  it("keys tenant tables by workspace_id", () => {
    expect(getTableColumns(tenantSubscriptionModel).workspaceId).toBeDefined()
    expect(getTableColumns(tenantUsageModel).workspaceId).toBeDefined()
    expect(getTableColumns(lsEventModel).eventId).toBeDefined()
    expect(getTableColumns(planModel).key).toBeDefined()
  })

  it("carries the PLAN-C plan columns", () => {
    const columns = getTableColumns(planModel)
    for (const column of [
      "workspacesLimit",
      "channelsLimit",
      "membersLimit",
      "contactsLimit",
      "botMessagesLimit",
      "features",
      "monthlyPriceCents",
      "trialDays",
      "lsVariantId",
    ]) {
      expect(columns[column as keyof typeof columns]).toBeDefined()
    }
  })
})

describe("migration (slice_tenancy_ent pattern)", () => {
  const sql = readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8")

  it("enables RLS on the workspace-keyed tables with the app.workspace_id policy", () => {
    for (const table of ["tenant_subscription", "tenant_usage"]) {
      expect(sql).toContain(
        `ALTER TABLE "ent"."${table}" ENABLE ROW LEVEL SECURITY`,
      )
      expect(sql).toContain(`CREATE POLICY "${table}_rls" ON "ent"."${table}"`)
      expect(sql).toContain("current_setting('app.workspace_id', true)::bigint")
    }
  })

  it("seeds the free and pro plans with the agreed limits", () => {
    expect(sql).toContain("('free', 'Free', 1, 2, 3, 1000, 500")
    expect(sql).toContain("('pro', 'Pro', 10, 10, 15, 10000, 5000")
    expect(sql).toContain('"commerce"')
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
  })

  it("matches the seed catalog in code", () => {
    const free = PLAN_SEEDS.find((plan) => plan.key === "free")
    const pro = PLAN_SEEDS.find((plan) => plan.key === "pro")
    expect(free).toMatchObject({
      workspacesLimit: 1,
      channelsLimit: 2,
      membersLimit: 3,
      contactsLimit: 1000,
      botMessagesLimit: 500,
      monthlyPriceCents: 0,
      trialDays: 0,
    })
    expect(pro).toMatchObject({
      workspacesLimit: 10,
      channelsLimit: 10,
      membersLimit: 15,
      contactsLimit: 10_000,
      botMessagesLimit: 5000,
      monthlyPriceCents: 2900,
      trialDays: 14,
      features: [
        "commerce",
        "branding",
        "domains",
        "audit",
        "email",
        "api",
        "advancedAI",
      ],
    })
  })

  it("renames every snake_case column the models address as camelCase", () => {
    expect(sql).not.toContain("RENAME COLUMN")
  })
})

describe("corrective migration (camel columns)", () => {
  const sql = readFileSync(new URL(CORRECTIVE_PATH, import.meta.url), "utf8")

  it("renames the snake columns on all six ent tables", () => {
    for (const rename of [
      '"ent"."workspace_meta" RENAME COLUMN "workspace_id" TO "workspaceId"',
      '"ent"."workspace_meta" RENAME COLUMN "suspended_at" TO "suspendedAt"',
      '"ent"."isolation_probe" RENAME COLUMN "workspace_id" TO "workspaceId"',
      '"ent"."isolation_probe" RENAME COLUMN "created_at" TO "createdAt"',
      '"ent"."plan" RENAME COLUMN "workspaces_limit" TO "workspacesLimit"',
      '"ent"."plan" RENAME COLUMN "monthly_price_cents" TO "monthlyPriceCents"',
      '"ent"."plan" RENAME COLUMN "ls_variant_id" TO "lsVariantId"',
      '"ent"."tenant_subscription" RENAME COLUMN "workspace_id" TO "workspaceId"',
      '"ent"."tenant_subscription" RENAME COLUMN "plan_key" TO "planKey"',
      '"ent"."tenant_subscription" RENAME COLUMN "trial_ends_at" TO "trialEndsAt"',
      '"ent"."tenant_subscription" RENAME COLUMN "ls_subscription_id" TO "lsSubscriptionId"',
      '"ent"."tenant_usage" RENAME COLUMN "bot_messages_used" TO "botMessagesUsed"',
      '"ent"."tenant_usage" RENAME COLUMN "bot_messages_period_start" TO "botMessagesPeriodStart"',
      '"ent"."ls_event" RENAME COLUMN "event_id" TO "eventId"',
      '"ent"."ls_event" RENAME COLUMN "event_name" TO "eventName"',
      '"ent"."ls_event" RENAME COLUMN "processed_at" TO "processedAt"',
    ]) {
      expect(sql).toContain(rename)
    }
  })

  it("is rename-only and guarded (no seed rewrite, DO blocks + IF EXISTS)", () => {
    expect(sql).toContain("information_schema.columns")
    expect(sql).not.toContain("INSERT INTO")
    expect(sql).toContain('DROP POLICY IF EXISTS "tenant_subscription_rls"')
  })

  it("rebuilds the RLS policies against the renamed column", () => {
    expect(sql.match(/CREATE POLICY/g)?.length).toBe(4)
    expect(
      sql.match(/"workspaceId" = current_setting\('app\.workspace_id', true\)::bigint/g)
        ?.length,
    ).toBe(8)
  })

})
