'use client'

import { useState } from 'react'
import Image from 'next/image'
import MettleBackground from './MettleBackground'
import styles from './landing.module.css'

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'submitting') return
    setState('submitting')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setState('done')
        setEmail('')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <div className={styles.page}>
      <MettleBackground />

      <main className={styles.main}>
        <div className={styles.mascotWrap}>
          <Image
            src="/dumpsterfireguy.png"
            alt="Dumpster fire mascot"
            width={300}
            height={300}
            className={styles.mascot}
            priority
          />
        </div>

        <h1 className={styles.headline}>
          THE JOB MARKET<br />
          IS A DUMPSTER FIRE
        </h1>

        <p className={styles.body}>
          We&rsquo;re building a tool to help you apply more efficiently
          and with your own words.
          Not automated, just a little better. Your job command center.
        </p>

        <div className={styles.cta}>
          <p className={styles.ctaLabel}>
            Interested? Hit us up. This list will be for beta&nbsp;testers.
          </p>

          {state === 'done' ? (
            <p className={styles.success}>You&rsquo;re on the list.</p>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={styles.input}
                required
                disabled={state === 'submitting'}
              />
              <button
                type="submit"
                className={styles.button}
                disabled={state === 'submitting'}
              >
                {state === 'submitting' ? 'Sending...' : 'Join Waitlist'}
              </button>
              {state === 'error' && (
                <p className={styles.errorMsg}>Something went wrong. Try again.</p>
              )}
            </form>
          )}
        </div>

        <div className={styles.pitchDivider} aria-hidden="true" />
        <p className={styles.pitch}>
          Use your resume, your skills, and your voice to find the right hiring manager,
          reach out with your words and personality, and apply directly.
        </p>
      </main>
    </div>
  )
}
