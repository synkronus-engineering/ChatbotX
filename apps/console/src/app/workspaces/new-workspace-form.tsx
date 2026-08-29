"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function NewWorkspaceForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [plan, setPlan] = useState("free")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerEmail: email, plan }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to provision")
      }
      setSuccess(
        data.created
          ? `Workspace "${name}" provisioned for ${email}`
          : `${email} already owns workspace "${data.workspaceId}"`,
      )
      setName("")
      setEmail("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-end",
        padding: 16,
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e5e5",
      }}
    >
      <label
        style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
      >
        <span style={{ fontSize: 13, color: "#374151" }}>Workspace name</span>
        <input
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Salon Bella Vista"
          required
          style={inputStyle}
          value={name}
        />
      </label>
      <label
        style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
      >
        <span style={{ fontSize: 13, color: "#374151" }}>Owner email</span>
        <input
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@example.com"
          required
          style={inputStyle}
          type="email"
          value={email}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 13, color: "#374151" }}>Plan</span>
        <select
          onChange={(e) => setPlan(e.target.value)}
          style={inputStyle}
          value={plan}
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="reseller">Reseller</option>
        </select>
      </label>
      <button
        disabled={loading}
        style={{
          padding: "10px 20px",
          background: loading ? "#93c5fd" : "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          cursor: loading ? "not-allowed" : "pointer",
        }}
        type="submit"
      >
        {loading ? "Provisioning…" : "Create Workspace"}
      </button>
      {error && <span style={{ color: "#dc2626", fontSize: 13 }}>{error}</span>}
      {success && (
        <span style={{ color: "#16a34a", fontSize: 13 }}>{success}</span>
      )}
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  outline: "none",
}
