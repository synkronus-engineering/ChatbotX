-- Konversify enterprise layer: tenancy spine (E1) tables.
-- Tenant identity = MIT-zone Workspace row; every table keys on workspace_id.
-- RLS is enforced at the database level via the app.workspace_id session variable.

CREATE SCHEMA IF NOT EXISTS "ent";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ent"."workspace_meta" (
    "workspace_id" bigint PRIMARY KEY REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "plan" text DEFAULT 'free' NOT NULL,
    "locale" text DEFAULT 'es' NOT NULL,
    "suspended_at" timestamp(6) with time zone
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ent"."isolation_probe" (
    "id" bigint PRIMARY KEY,
    "workspace_id" bigint NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "payload" text NOT NULL,
    "created_at" timestamp(6) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- RLS: every ent.* table filters by the workspace_id session variable.
-- Without it set, rows are invisible (fail-closed).

ALTER TABLE "ent"."workspace_meta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "ent"."isolation_probe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "workspace_meta_rls" ON "ent"."workspace_meta"
    FOR ALL
    USING ("workspace_id" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::bigint);--> statement-breakpoint

CREATE POLICY "isolation_probe_rls" ON "ent"."isolation_probe"
    FOR ALL
    USING ("workspace_id" = current_setting('app.workspace_id', true)::bigint)
    WITH CHECK ("workspace_id" = current_setting('app.workspace_id', true)::bigint);
