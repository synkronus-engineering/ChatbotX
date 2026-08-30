import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Names only — values are deploy secrets set in Coolify (EXEC-TRACKS §LS
 * state). Everything optional so the package imports cleanly in environments
 * without billing configured; the routes fail closed at request time.
 */
export const keys = () =>
  createEnv({
    server: {
      LEMONSQUEEZY_API_KEY: z.string().optional(),
      LEMONSQUEEZY_STORE_ID: z.string().optional(),
      LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
      LEMONSQUEEZY_MODE: z.enum(["live", "test"]).default("live"),
      LEMONSQUEEZY_BASE_URL: z.string().optional(),
      KONVERSIFY_EXPIRE_SECRET: z.string().optional(),
    },
    runtimeEnv: process.env,
  })
