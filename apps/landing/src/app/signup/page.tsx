"use client"

import Link from "next/link"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"
import {
  buildWorkspaceUrl,
  provisionWorkspace,
  storePendingBusinessName,
} from "../../lib/provision"
import { ERRORS, SIGNUP } from "../../lib/site-copy"

type FormState = "form" | "verify-email"

export default function SignUpPage() {
  const [state, setState] = useState<FormState>("form")
  const [name, setName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data, error: signUpError } = await authClient.signUp.email({
        email,
        name,
        password,
      })

      if (signUpError) {
        setError(signUpError.message ?? ERRORS.generic)
        return
      }

      storePendingBusinessName(businessName.trim())

      // Builder config requires email verification: until the link is
      // confirmed, sign-in will not mint a session, so park on the
      // verify state; /signin resumes provisioning afterwards.
      if (data?.user && !data.user.emailVerified) {
        setState("verify-email")
        return
      }

      const result = await provisionWorkspace(businessName.trim())
      if (result?.workspaceId) {
        window.location.href = buildWorkspaceUrl(result.workspaceId)
        return
      }
      window.location.href = "/signin"
    } catch {
      setError(ERRORS.generic)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        {state === "verify-email" ? (
          <div className="verify-state">
            <div className="icon">📧</div>
            <h1>{SIGNUP.verifyTitle}</h1>
            <p className="subtitle">{SIGNUP.verifyBody}</p>
            <Link className="btn btn-primary btn-block" href="/signin">
              {SIGNUP.verifyCta}
            </Link>
          </div>
        ) : (
          <>
            <h1>{SIGNUP.title}</h1>
            <p className="subtitle">{SIGNUP.subtitle}</p>
            {error ? <div className="form-error">{error}</div> : null}
            <form noValidate onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="businessName">{SIGNUP.businessNameLabel}</label>
                <input
                  id="businessName"
                  name="businessName"
                  onChange={(event) => setBusinessName(event.target.value)}
                  required
                  type="text"
                  value={businessName}
                />
              </div>
              <div className="field">
                <label htmlFor="name">{SIGNUP.nameLabel}</label>
                <input
                  id="name"
                  name="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  type="text"
                  value={name}
                />
              </div>
              <div className="field">
                <label htmlFor="email">{SIGNUP.emailLabel}</label>
                <input
                  autoComplete="email"
                  id="email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="field">
                <label htmlFor="password">{SIGNUP.passwordLabel}</label>
                <input
                  autoComplete="new-password"
                  id="password"
                  minLength={8}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <button
                className="btn btn-primary btn-block"
                disabled={submitting}
                type="submit"
              >
                {submitting ? SIGNUP.submitting : SIGNUP.submit}
              </button>
            </form>
            <p className="auth-alt">
              {SIGNUP.signInPrompt}{" "}
              <Link href="/signin">{SIGNUP.signInLink}</Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
