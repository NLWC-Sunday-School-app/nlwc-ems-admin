import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { ApiError, api } from "../lib/api";
import { useSession } from "../lib/session";
import { ErrorAlert } from "./ui";
import type { LoginResult } from "../lib/types";

export function secretFromOtpauth(uri: string): string {
  try { return new URL(uri).searchParams.get("secret") ?? ""; } catch { return ""; }
}

/** The secret in groups of four, easier to type into an authenticator by hand. */
export const groupSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

export function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} aria-labelledby="signin-h">
        <div><span className="badge b-neutral">Staff console</span></div>
        <h1 id="signin-h">Sign in</h1>
        <p className="sm muted">For NLWC staff and volunteers. You will be asked for your authenticator code next.</p>
        <div className="field"><label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <ErrorAlert error={error} />
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
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

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("auth/mfa/verify", { code });
      await refreshMe();
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === "invalid_code") setCode("");
    } finally {
      setBusy(false);
    }
  };

  const secret = uri ? secretFromOtpauth(uri) : "";

  return (
    <main className="auth-wrap">
      <form className="card auth-card" onSubmit={verify} aria-labelledby="mfa-h">
        <div><span className="badge b-warn">Step 2 of 2</span></div>
        <h1 id="mfa-h">{!enrolled ? "Set up your authenticator" : "Enter your authenticator code"}</h1>

        {!enrolled && !uri && !error ? <p className="sm muted" role="status">Preparing your setup key…</p> : null}
        {!enrolled && uri ? (
          <>
            <p className="sm muted">Scan this with an authenticator app (Google Authenticator, 1Password, Authy), or type the key in by hand. Then enter the 6-digit code it shows.</p>
            <div className="qr-box">
              {qr ? <img src={qr} width={200} height={200} alt="QR code for your authenticator app" /> : <span className="muted sm">Preparing QR code…</span>}
              <div className="sm" style={{ textAlign: "center" }}>
                <div className="muted xs">Or enter this key</div>
                <span className="mono" style={{ color: "#000", userSelect: "all" }}>{groupSecret(secret)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="sm muted">Open your authenticator app and type the current 6-digit code. Staff permissions only work once this is done.</p>
        )}

        <div className="field"><label htmlFor="mfa-code">6-digit code</label>
          <input id="mfa-code" className="input code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
        <ErrorAlert error={error} />
        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and continue"}</button>

        <div className="row between sm">
          {!enrolled && !uri && error ? <button type="button" className="btn btn-ghost btn-sm" onClick={startEnroll} disabled={busy}>Try again</button> : <span />}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>Sign out</button>
        </div>
        {enrolled && <p className="xs muted">Lost your device? Ask an administrator to reset your authenticator.</p>}
      </form>
    </main>
  );
}

export type { LoginResult };
