-- Konversify enterprise layer: plans and billing (S6, Contract 5).
-- Workspace-keyed tables follow the slice_tenancy_ent RLS pattern (fail-closed
-- on app.workspace_id); ent.plan and ent.ls_event are server-side
-- reference/audit tables with no workspace column and no RLS policy.

CREATE TABLE IF NOT EXISTS "ent"."plan" (
    "key" text PRIMARY KEY,
    "name" text NOT NULL,
    "workspaces_limit" integer NOT NULL,
    "channels_limit" integer NOT NULL,
    "members_limit" integer NOT NULL,
    "contacts_limit" integer NOT NULL,
    "bot_messages_limit" integer NOT NULL,
    "features" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "monthly_price_cents" integer DEFAULT 0 NOT NULL,
    "trial_days" integer DEFAULT 0 NOT NULL,
    "ls_variant_id" text,
    "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ent"."tenant_subscription" (
    "workspace_id" bigint PRIMARY KEY REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "plan_key" text NOT NULL REFERENCES "ent"."plan"("key"),
    "status" text DEFAULT 'active' NOT NULL,
    "trial_ends_at" timestamp(6) with time zone,
    "period_start" timestamp(6) with time zone,
    "period_end" timestamp(6) with time zone,
    "ls_customer_id" text,
    "ls_subscription_id" text,
    "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ent"."tenant_usage" (
    "workspace_id" bigint PRIMARY KEY REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "bot_messages_used" integer DEFAULT 0 NOT NULL,
    "bot_messages_period_start" timestamp(6) with time zone,
    "updated_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ent"."ls_event" (
    "event_id" text PRIMARY KEY,
    "event_name" text NOT NULL,
    "workspace_id" bigint REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "processed_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ls_event_event_id_key" ON "ent"."ls_event" USING btree ("event_id");--> statement-breakpoint

ALTER TABLE "ent"."tenant_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ent"."tenant_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "tenant_subscription_rls" ON "ent"."tenant_subscription"
    FOR ALL
    USING ("workspace_id" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

CREATE POLICY "tenant_usage_rls" ON "ent"."tenant_usage"
    FOR ALL
    USING ("workspace_id" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

-- Seed catalog (packages/slice-plans/src/data/plans.ts is the source of truth).
-- ls_variant_id stays NULL until the LS product exists (EXEC-TRACKS "LS state").

INSERT INTO "ent"."plan" ("key", "name", "workspaces_limit", "channels_limit", "members_limit", "contacts_limit", "bot_messages_limit", "features", "monthly_price_cents", "trial_days")
VALUES
    ('free', 'Free', 1, 2, 3, 1000, 500, '[]'::jsonb, 0, 0),
    ('pro', 'Pro', 10, 10, 15, 10000, 5000, '["commerce","branding","domains","audit","email","api","advancedAI"]'::jsonb, 2900, 14)
ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "workspaces_limit" = EXCLUDED."workspaces_limit",
    "channels_limit" = EXCLUDED."channels_limit",
    "members_limit" = EXCLUDED."members_limit",
    "contacts_limit" = EXCLUDED."contacts_limit",
    "bot_messages_limit" = EXCLUDED."bot_messages_limit",
    "features" = EXCLUDED."features",
    "monthly_price_cents" = EXCLUDED."monthly_price_cents",
    "trial_days" = EXCLUDED."trial_days",
    "updated_at" = now();
