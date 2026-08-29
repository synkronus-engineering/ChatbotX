import { describe, expect, it } from "vitest"
import { ent, isolationProbeModel, workspaceMetaModel } from "../data/schema"

describe("slice-tenancy schema", () => {
  it("uses the ent schema namespace", () => {
    expect(ent.schemaName).toBe("ent")
  })

  it("keys every table by workspace_id", () => {
    expect(workspaceMetaModel.workspaceId).toBeDefined()
    expect(isolationProbeModel.workspaceId).toBeDefined()
  })
})
