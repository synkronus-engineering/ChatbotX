// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { runtimeBuilderUrl } from "../lib/config"
import { builderUrl, buildWorkspaceUrl } from "../lib/provision"
import { PLANS } from "../lib/site-copy"

describe("runtimeBuilderUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BUILDER_URL
  })

  it("prefers the runtime config injected by /config.js", () => {
    process.env.NEXT_PUBLIC_BUILDER_URL = "https://build-time.example"
    window.__KONVERSIFY__ = { builderUrl: "https://my.konversify.app" }
    expect(runtimeBuilderUrl()).toBe("https://my.konversify.app")
    window.__KONVERSIFY__ = undefined
  })

  it("falls back to the build-time env outside the browser script", () => {
    process.env.NEXT_PUBLIC_BUILDER_URL = "https://my.konversify.app"
    expect(runtimeBuilderUrl()).toBe("https://my.konversify.app")
  })

  it("is empty when nothing is configured, keeping URLs relative", () => {
    expect(runtimeBuilderUrl()).toBe("")
  })
})

describe("buildWorkspaceUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BUILDER_URL
  })

  it("targets the builder workspace dashboard", () => {
    process.env.NEXT_PUBLIC_BUILDER_URL = "https://my.konversify.app"
    expect(buildWorkspaceUrl("42")).toBe(
      "https://my.konversify.app/space/42/dashboard",
    )
  })

  it("falls back to a relative path when the builder url is unset", () => {
    expect(buildWorkspaceUrl("7")).toBe("/space/7/dashboard")
  })
})

describe("builderUrl", () => {
  it("delegates to the runtime config", () => {
    process.env.NEXT_PUBLIC_BUILDER_URL = "https://my.konversify.app"
    expect(builderUrl()).toBe("https://my.konversify.app")
    delete process.env.NEXT_PUBLIC_BUILDER_URL
  })
})

describe("plan copy", () => {
  it("advertises free and pro with the agreed price points", () => {
    expect(PLANS.map((plan) => plan.name)).toEqual(["Gratis", "Pro"])
    const pro = PLANS.find((plan) => plan.highlight)
    expect(pro?.price).toBe("$29")
    expect(pro?.limits).toHaveLength(5)
  })
})
