"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import mascotImg from "../dumpsterfireguy.png";
import SiteHeader from "../components/SiteHeader";
import {
  isGoogleSignInEnabled,
  signInWithGoogle,
  signUpWithPasswordSession,
} from "@/lib/public-auth/supabase-browser";
import styles from "./signup.module.css";

// Create-account surface (approved onboarding-sign-up DS card). Google is one-tap;
// email sign-up sets a password, then the card swaps to a check-your-email state.
// Both paths funnel to the /plan step next (the routing gate lives there).
export default function SignUpClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const canSubmit = /.+@.+\..+/.test(email) && password.length >= 8 && !busy;

  async function signUpGoogle() {
    setBusy(true);
    setMessage("Sending you to Google…");
    try {
      await signInWithGoogle("/plan");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign up failed.");
      setBusy(false);
    }
  }

  async function createAccount() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage("Creating your account…");
    try {
      const { needsConfirmation } = await signUpWithPasswordSession(email, password, "/plan");
      if (needsConfirmation) {
        setSent(true);
        setMessage("");
      } else {
        router.replace("/plan");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await signUpWithPasswordSession(email, password, "/plan");
      setMessage("Confirmation link sent again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resend the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SiteHeader sectionHrefPrefix="/" />
      <div className={styles.loginShell}>
        {sent ? (
          <div className={styles.loginCard}>
            <span className={styles.confirmIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <polyline points="3 7 12 13 21 7" />
              </svg>
            </span>
            <h2 className={styles.title}>Check your email</h2>
            <p className={styles.confirmBody}>
              We sent a confirmation link to<br />
              <span className={styles.confirmEmail}>{email}</span><br />
              Click it to finish setting up your account.
            </p>
            <p className={styles.altLine}>
              Didn&rsquo;t get it? <button type="button" className={styles.resend} disabled={busy} onClick={resend}>Resend link</button>
            </p>
            <p className={styles.msg}>{message}</p>
          </div>
        ) : (
          <div className={styles.loginCard}>
            <Image className={styles.mascot} src={mascotImg} alt="" sizes="112px" />
            <h2 className={styles.title}>Create your profile</h2>
            <p className={styles.sub}>Your profile is what makes the outreach sound like you.</p>
            {isGoogleSignInEnabled() ? (
              <div className={styles.authStack}>
                <button type="button" className={styles.googleBtn} disabled={busy} onClick={signUpGoogle}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1 2.6-2.1 3.4l3.4 2.6c2-1.84 3.1-4.55 3.1-7.75 0-.74-.07-1.45-.2-2.15z" />
                    <path fill="#34A853" d="M6.6 14.3l-.77.6-2.7 2.1C4.8 20 8.1 22 12 22c2.7 0 5-.9 6.65-2.4l-3.4-2.6c-.9.6-2.05.96-3.25.96-2.5 0-4.6-1.7-5.36-3.96z" />
                    <path fill="#4285F4" d="M3.13 7c-.7 1.4-1.1 3-1.1 4.7s.4 3.3 1.1 4.7l3.47-2.7c-.2-.6-.32-1.3-.32-2s.12-1.4.32-2z" />
                    <path fill="#FBBC05" d="M12 6.04c1.47 0 2.78.5 3.82 1.5l2.85-2.85C16.96 3.06 14.7 2 12 2 8.1 2 4.8 4 3.13 7l3.47 2.7C7.4 7.74 9.5 6.04 12 6.04z" />
                  </svg>
                  Continue with Google
                </button>
              </div>
            ) : null}
            <div className={styles.divider}><span>or sign up with email</span></div>
            <div className={styles.field}>
              <label htmlFor="signup-email">Email</label>
              <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div className={styles.field}>
              <label htmlFor="signup-pass">Password</label>
              <input id="signup-pass" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" />
            </div>
            <p className={styles.fieldHint}>At least 8 characters.</p>
            <button type="button" className={styles.primary} disabled={!canSubmit} onClick={createAccount}>Create account</button>
            <p className={styles.altLine}>Already have an account? <Link href="/onboarding">Sign in</Link></p>
            <p className={styles.msg}>{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
