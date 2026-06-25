"use client";

import { useState } from "react";
import styles from "./scans.module.css";

export default function LoginPanel() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    try {
      const response = await fetch("/scans/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to sign in.");
      }

      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.meshBg} aria-hidden="true" />
      <section className={styles.loginShell} aria-labelledby="dumpster-fire-login-title">
        <div className={styles.loginCard}>
          <h1 id="dumpster-fire-login-title">Private job dashboard</h1>
          <p>Use the access code to open private scans.</p>
          <form className={styles.loginForm} onSubmit={submitLogin}>
            <label>
              <span>Access code</span>
              <input
                type="password"
                value={code}
                autoComplete="current-password"
                required
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            {error && <p className={styles.loginError}>{error}</p>}
            <button type="submit" className={styles.btnApply} disabled={isPending}>
              {isPending ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
