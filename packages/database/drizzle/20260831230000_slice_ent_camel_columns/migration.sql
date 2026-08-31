-- Corrective migration: align ent.* column names with the repo's quoted
-- camelCase convention (vendor schema uses "Workspace"."ownerId"; the Drizzle
-- models declare bare property names, which map to camelCase columns).
-- The two original hand-written migrations created snake_case columns, so
-- every model-driven query against ent.* failed live with 42703 (e.g.
-- INSERT INTO ent.ls_event ("eventId", ...) — column does not exist).
--
-- Rename-only: prod already seeded ent.plan; no re-seed, no data changes.
-- Original migration files stay untouched (fresh installs run originals then
-- this corrective, ending at the same camelCase state).
-- Each rename is guarded so the migration is idempotent and safe on databases
-- where the ent schema or a specific table never existed (upstream installs).

-- ─── ent.workspace_meta ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'workspace_meta' AND column_name = 'workspace_id') THEN
    ALTER TABLE "ent"."workspace_meta" RENAME COLUMN "workspace_id" TO "workspaceId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'workspace_meta' AND column_name = 'suspended_at') THEN
    ALTER TABLE "ent"."workspace_meta" RENAME COLUMN "suspended_at" TO "suspendedAt";
  END IF;
END
$$;--> statement-breakpoint

-- ─── ent.isolation_probe ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'isolation_probe' AND column_name = 'workspace_id') THEN
    ALTER TABLE "ent"."isolation_probe" RENAME COLUMN "workspace_id" TO "workspaceId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'isolation_probe' AND column_name = 'created_at') THEN
    ALTER TABLE "ent"."isolation_probe" RENAME COLUMN "created_at" TO "createdAt";
  END IF;
END
$$;--> statement-breakpoint

-- ─── ent.plan ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'workspaces_limit') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "workspaces_limit" TO "workspacesLimit";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'channels_limit') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "channels_limit" TO "channelsLimit";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'members_limit') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "members_limit" TO "membersLimit";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'contacts_limit') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "contacts_limit" TO "contactsLimit";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'bot_messages_limit') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "bot_messages_limit" TO "botMessagesLimit";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'monthly_price_cents') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "monthly_price_cents" TO "monthlyPriceCents";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'trial_days') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "trial_days" TO "trialDays";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'ls_variant_id') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "ls_variant_id" TO "lsVariantId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'created_at') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "created_at" TO "createdAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'plan' AND column_name = 'updated_at') THEN
    ALTER TABLE "ent"."plan" RENAME COLUMN "updated_at" TO "updatedAt";
  END IF;
END
$$;--> statement-breakpoint

-- ─── ent.tenant_subscription ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'workspace_id') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "workspace_id" TO "workspaceId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'plan_key') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "plan_key" TO "planKey";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'trial_ends_at') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "trial_ends_at" TO "trialEndsAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'period_start') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "period_start" TO "periodStart";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'period_end') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "period_end" TO "periodEnd";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'ls_customer_id') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "ls_customer_id" TO "lsCustomerId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'ls_subscription_id') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "ls_subscription_id" TO "lsSubscriptionId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'created_at') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "created_at" TO "createdAt";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_subscription' AND column_name = 'updated_at') THEN
    ALTER TABLE "ent"."tenant_subscription" RENAME COLUMN "updated_at" TO "updatedAt";
  END IF;
END
$$;--> statement-breakpoint

-- ─── ent.tenant_usage ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_usage' AND column_name = 'workspace_id') THEN
    ALTER TABLE "ent"."tenant_usage" RENAME COLUMN "workspace_id" TO "workspaceId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_usage' AND column_name = 'bot_messages_used') THEN
    ALTER TABLE "ent"."tenant_usage" RENAME COLUMN "bot_messages_used" TO "botMessagesUsed";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_usage' AND column_name = 'bot_messages_period_start') THEN
    ALTER TABLE "ent"."tenant_usage" RENAME COLUMN "bot_messages_period_start" TO "botMessagesPeriodStart";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'tenant_usage' AND column_name = 'updated_at') THEN
    ALTER TABLE "ent"."tenant_usage" RENAME COLUMN "updated_at" TO "updatedAt";
  END IF;
END
$$;--> statement-breakpoint

-- ─── ent.ls_event ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'event_id') THEN
    ALTER TABLE "ent"."ls_event" RENAME COLUMN "event_id" TO "eventId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'event_name') THEN
    ALTER TABLE "ent"."ls_event" RENAME COLUMN "event_name" TO "eventName";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'workspace_id') THEN
    ALTER TABLE "ent"."ls_event" RENAME COLUMN "workspace_id" TO "workspaceId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'processed_at') THEN
    ALTER TABLE "ent"."ls_event" RENAME COLUMN "processed_at" TO "processedAt";
  END IF;
END
$$;--> statement-breakpoint

-- RLS policies: rebuilt to reference the renamed column (rename does not
-- rewrite policy expressions; drop + recreate, guarded). The unique index
-- ls_event_event_id_key follows the renamed column automatically.

DROP POLICY IF EXISTS "workspace_meta_rls" ON "ent"."workspace_meta";--> statement-breakpoint
DROP POLICY IF EXISTS "isolation_probe_rls" ON "ent"."isolation_probe";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_subscription_rls" ON "ent"."tenant_subscription";--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_usage_rls" ON "ent"."tenant_usage";--> statement-breakpoint

CREATE POLICY "workspace_meta_rls" ON "ent"."workspace_meta"
    FOR ALL
    USING ("workspaceId" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

CREATE POLICY "isolation_probe_rls" ON "ent"."isolation_probe"
    FOR ALL
    USING ("workspaceId" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

CREATE POLICY "tenant_subscription_rls" ON "ent"."tenant_subscription"
    FOR ALL
    USING ("workspaceId" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

CREATE POLICY "tenant_usage_rls" ON "ent"."tenant_usage"
    FOR ALL
    USING ("workspaceId" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)::bigint);
