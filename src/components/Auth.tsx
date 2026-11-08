import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import QRCode from "qrcode";
import { ApiError, api } from "../lib/api";
import { useSession } from "../lib/session";
import { ErrorAlert } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import type { LoginResult } from "../lib/types";

export function secretFromOtpauth(uri: string): string {
  try { return new URL(uri).searchParams.get("secret") ?? ""; } catch { return ""; }
}

/** The secret in groups of four, easier to type into an authenticator by hand. */
export const groupSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

/** Brand panel on the left, the form on the right. On narrow screens the panel folds into a logo above the form. */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-brand" aria-hidden="true">
        <img className="auth-brand-logo" src="/nlwc-logo-white.png" alt="" />
        <div className="auth-brand-copy">
          <p className="auth-eyebrow">Events Management System</p>
          <p className="auth-brand-title">Staff console</p>
          <ul className="auth-points">
            <li>Registrations, check-in and camp review</li>
            <li>Pricing, editions and people</li>
            <li>Every change is recorded in the audit log</li>
          </ul>
        </div>
        <p className="auth-brand-foot">The New &amp; Living Way Church</p>
      </aside>
      <main className="auth-main">
        <div className="auth-topbar"><ThemeToggle /></div>
        <div className="auth-panel">
          <div className="auth-mobile-logo">
            <img className="logo-light" src="/nlwc-logo-coloured.png" alt="The New & Living Way Church" />
            <img className="logo-dark" src="/nlwc-logo-white.png" alt="The New & Living Way Church" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err);
      // Rejected credentials: clear the password and put the cursor back, keep the email. A server error keeps both for a retry.
      if (err instanceof ApiError && err.status < 500) setPassword("");
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <AuthLayout>
      <header className="auth-head">
        <h1 id="signin-h">Welcome back</h1>
        <p className="muted">Sign in to the NLWC staff console.</p>
      </header>

      <form className="auth-form" onSubmit={submit} aria-labelledby="signin-h">
        <div className="field"><label htmlFor="email">Email address</label>
          <input id="email" className="input" type="email" autoComplete="username" inputMode="email" autoFocus required
            placeholder="you@nlwc.church" value={email} onChange={(e) => setEmail(e.target.value)} /></div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="pw-wrap">
            <input id="password" ref={passwordRef} className="input" type={showPassword ? "text" : "password"} autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={trackCaps} onKeyUp={trackCaps} onBlur={() => setCapsLock(false)}
              aria-describedby={capsLock ? "caps-hint" : undefined} />
            <button type="button" className="pw-toggle" onClick={() => setShowPassword((s) => !s)} aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="password">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {showPassword
                  ? <><path d="M17.9 17.9A10.4 10.4 0 0 1 12 20c-6.5 0-10-8-10-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.6 9.6 0 0 1 12 4c6.5 0 10 8 10 8a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="M2 2l20 20" /></>
                  : <><path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>
          {capsLock && <p id="caps-hint" className="xs auth-caps" role="status">Caps Lock is on</p>}
        </div>

        <ErrorAlert error={error} />

        <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy || !email.trim() || !password} aria-busy={busy}>
          {busy ? <><Spinner /> Signing in…</> : "Sign in"}
        </button>
      </form>

      <footer className="auth-foot xs muted">
        <p>Trouble signing in? Ask a super admin to check your account.</p>
        <p>On a shared computer? You are signed out when the browser closes.</p>
      </footer>
    </AuthLayout>
  );
}

/** Staff permissions only count on an MFA-verified session, so nothing else loads until this passes. */
export function MfaGate() {
  const { me, refreshMe, signOut } = useSession();
  // The API says whether an authenticator already exists. If it does, only a code is ever asked for: setting up again would replace it.
  const enrolled = me?.mfaEnrolled ?? false;
  const [uri, setUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!uri) { setQr(null); return; }
    let alive = true;
    QRCode.toDataURL(uri, { margin: 1, width: 400 }).then((url) => alive && setQr(url)).catch(() => alive && setQr(null));
    return () => { alive = false; };
  }, [uri]);

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ otpauthUri: string }>("auth/mfa/enroll");
      setUri(r.otpauthUri);
      setCode("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const started = useRef(false);
  useEffect(() => {
    if (enrolled || started.current) return;
    started.current = true;
    void startEnroll();
  }, [enrolled]); // eslint-disable-line react-hooks/exhaustive-deps

  const codeRef = useRef<HTMLInputElement>(null);

  const submitCode = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("auth/mfa/verify", { code: value });
      await refreshMe();
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === "invalid_code") setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    void submitCode(code);
  };

  // Typing or pasting the sixth digit submits, so nobody has to reach for the button.
  const onCode = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submitCode(digits);
  };

  const secret = uri ? secretFromOtpauth(uri) : "";
  const [copied, setCopied] = useState(false);
  const copySecret = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard can be blocked; the key is still selectable */ }
  };

  return (
    <AuthLayout>
      <header className="auth-head">
        <p className="auth-step">{enrolled ? "One more step" : "One-time setup"}</p>
        <h1 id="mfa-h">{!enrolled ? "Set up your authenticator" : "Enter your code"}</h1>
        <p className="muted">
          {!enrolled
            ? "Staff accounts are protected with a second step. You only need to do this once."
            : "Open your authenticator app and enter the 6-digit code for NLWC EMS."}
        </p>
      </header>

      <form className="auth-form" onSubmit={verify} aria-labelledby="mfa-h">
        {!enrolled && !uri && !error ? <p className="sm muted" role="status"><Spinner /> Preparing your setup key…</p> : null}
        {!enrolled && uri ? (
          <ol className="auth-steps">
            <li>
              <span>Scan this QR code with an authenticator app such as Google Authenticator, 1Password or Authy.</span>
              <div className="qr-box">
                {qr ? <img src={qr} width={200} height={200} alt="QR code for your authenticator app" /> : <span className="muted sm">Preparing QR code…</span>}
                <div className="qr-key">
                  <span className="xs qr-key-label">Can’t scan? Enter this key</span>
                  <span className="mono qr-key-value">{groupSecret(secret)}</span>
                  <button type="button" className="btn btn-ghost btn-sm qr-copy" onClick={copySecret}>{copied ? "Copied" : "Copy key"}</button>
                </div>
              </div>
            </li>
            <li><span>Enter the 6-digit code the app shows.</span></li>
          </ol>
        ) : null}

        <div className="field"><label htmlFor="mfa-code">6-digit code</label>
          <input id="mfa-code" ref={codeRef} className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
            placeholder="000000" value={code} onChange={(e) => onCode(e.target.value)} readOnly={busy} /></div>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-primary btn-block auth-submit" disabled={busy || code.length !== 6} aria-busy={busy}>
          {busy ? <><Spinner /> Checking…</> : "Verify and continue"}
        </button>

        <div className="row between sm">
          {!enrolled && !uri && error ? <button type="button" className="btn btn-ghost btn-sm" onClick={startEnroll} disabled={busy}>Try again</button> : <span />}
          <button type="button" className="link-btn" onClick={() => void signOut()}>Use a different account</button>
        </div>
      </form>

      {enrolled && <footer className="auth-foot xs muted"><p>Lost your device? Ask a super admin to reset your authenticator.</p></footer>}
    </AuthLayout>
  );
}

export type { LoginResult };
