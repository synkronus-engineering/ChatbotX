import NewWorkspaceForm from "./new-workspace-form"

export const dynamic = "force-dynamic"

type WS = {
  workspace_id: string
  name: string
  owner_email: string
  plan: string
  suspended_at: string | null
}

export default async function WorkspacesPage() {
  let workspaces: WS[] = []
  try {
    const res = await fetch("http://localhost:3100/api/workspaces", {
      cache: "no-store",
    })
    if (res.ok) {
      workspaces = await res.json()
    }
  } catch {
    // Empty list is the correct fallback while the API is unreachable.
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Workspaces</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Each workspace is a tenant.
      </p>
      <NewWorkspaceForm />
      {workspaces.length === 0 ? (
        <p style={{ color: "#999", marginTop: 32 }}>No workspaces yet.</p>
      ) : (
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}
        >
          <thead>
            <tr
              style={{ borderBottom: "2px solid #e5e5e5", textAlign: "left" }}
            >
              <th style={{ padding: 8, fontSize: 13 }}>Name</th>
              <th style={{ padding: 8, fontSize: 13 }}>Owner</th>
              <th style={{ padding: 8, fontSize: 13 }}>Plan</th>
              <th style={{ padding: 8, fontSize: 13 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws) => (
              <tr
                key={ws.workspace_id}
                style={{ borderBottom: "1px solid #eee" }}
              >
                <td style={{ padding: 10 }}>{ws.name}</td>
                <td style={{ padding: 10 }}>{ws.owner_email}</td>
                <td style={{ padding: 10 }}>{ws.plan}</td>
                <td style={{ padding: 10 }}>
                  {ws.suspended_at ? "Suspended" : "Active"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
