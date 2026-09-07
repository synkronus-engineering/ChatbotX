-- Webhook integrity (review P0 #2): ent.ls_event gains the completion marker
-- and the raw payload needed to replay events whose apply never finished.
-- Guarded and camelCase per repo convention; existing rows keep NULL
-- appliedAt (unknown state) — the replay sweep re-evaluates them, and rows
-- older than the corrective column with no raw payload are marked applied
-- so the sweep never spins on unparseable history.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'ent' AND table_name = 'ls_event')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'appliedAt') THEN
    ALTER TABLE "ent"."ls_event" ADD COLUMN "appliedAt" timestamp(6) with time zone;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'ent' AND table_name = 'ls_event')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'rawPayload') THEN
    ALTER TABLE "ent"."ls_event" ADD COLUMN "rawPayload" text NOT NULL DEFAULT '';
  END IF;
END
$$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ls_event_unapplied_idx" ON "ent"."ls_event" ("eventId") WHERE "appliedAt" IS NULL;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'ent' AND table_name = 'ls_event' AND column_name = 'appliedAt') THEN
    UPDATE "ent"."ls_event"
       SET "appliedAt" = now()
     WHERE "appliedAt" IS NULL
       AND ("rawPayload" IS NULL OR "rawPayload" = '');
  END IF;
END
$$;
