"use client"

import Link from "next/link"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"
import {
  builderUrl,
  buildWorkspaceUrl,
  provisionWorkspace,
  takePendingBusinessName,
} from "../../lib/provision"
import { ERRORS, SIGNIN } from "../../lib/site-copy"

export default function SignInPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [magicEmail, setMagicEmail] = useState("")
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [magicSubmitting, setMagicSubmitting] = useState(false)

  /**
   * Sign-in is the resume point for signups whose email verification parked
   * them on the verify state: the business name stashed at signup is consumed
   * here and the workspace provisioned before redirecting into the builder.
   */
  const finish = async () => {
    const pending = takePendingBusinessName()
    if (pending) {
      const result = await provisionWorkspace(pending)
      if (result?.workspaceId) {
        window.location.href = buildWorkspaceUrl(result.workspaceId)
        return
      }
      setError(ERRORS.provision)
    }
    window.location.href = builderUrl() || "/"
  }

  const handlePasswordSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message ?? ERRORS.generic)
        return
      }
      await finish()
    } catch {
      setError(ERRORS.generic)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setMagicSubmitting(true)
    try {
      const { error: magicError } = await authClient.signIn.magicLink({
        email: magicEmail,
        callbackURL: "/",
      })
      if (magicError) {
        setError(magicError.message ?? ERRORS.generic)
        return
      }
      setMagicSent(true)
    } catch {
      setError(ERRORS.generic)
    } finally {
      setMagicSubmitting(false)
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1>{SIGNIN.title}</h1>
        <p className="subtitle">{SIGNIN.subtitle}</p>
        {error ? <div className="form-error">{error}</div> : null}
        <form noValidate onSubmit={handlePasswordSignIn}>
          <div className="field">
            <label htmlFor="email">{SIGNIN.emailLabel}</label>
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
            <label htmlFor="password">{SIGNIN.passwordLabel}</label>
            <input
              autoComplete="current-password"
              id="password"
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
            {submitting ? SIGNIN.submitting : SIGNIN.submit}
          </button>
        </form>

        <div className="auth-divider">{SIGNIN.magicLinkLabel}</div>

        {magicSent ? (
          <div className="form-success">{SIGNIN.magicLinkSent}</div>
        ) : (
          <form noValidate onSubmit={handleMagicLink}>
            <div className="field">
              <label htmlFor="magicEmail">{SIGNIN.emailLabel}</label>
              <div className="magic-link-row">
                <input
                  id="magicEmail"
                  name="magicEmail"
                  onChange={(event) => setMagicEmail(event.target.value)}
                  required
                  type="email"
                  value={magicEmail}
                />
                <button
                  className="btn btn-secondary"
                  disabled={magicSubmitting}
                  type="submit"
                >
                  {SIGNIN.magicLinkSubmit}
                </button>
              </div>
            </div>
          </form>
        )}

        <p className="auth-alt">
          {SIGNIN.signUpPrompt} <Link href="/signup">{SIGNIN.signUpLink}</Link>
        </p>
      </div>
    </main>
  )
}
