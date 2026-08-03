"use client";

import { useState } from "react";
import { PublicProfileApiError, requestPublicProfileApi } from "@/lib/public-profile/client";
import type { AccountPlan } from "./useAccountSession";
import styles from "./account-popup.module.css";

// The Plan / Billing / change-plan popup, moved out of OnboardingClient
// (Randall, 2026-07-28) so the header can open it over any signed-in page
// instead of bouncing the user back to /onboarding. Copy, states, and handlers
// are unchanged from the version that shipped in the onboarding profile card.

export type AccountPopupKind = "plan" | "billing" | "change";

// Public tier names. Never surface internal plan_name values in UI copy.
const PLAN_LABELS: Record<string, string> = { basic: "Smoldering", premium: "Roaring", tester: "Full access" };

function planLabel(plan: string | null | undefined): string {
  return plan && PLAN_LABELS[plan] ? PLAN_LABELS[plan] : "Smoldering";
}

function accountPlanLabel(account: AccountPlan | null): string {
  const internalPlan = account?.planCode || account?.planName;
  if (account?.source === "access_code" || internalPlan === "tester") return "Full access";
  return account?.publicPlanName || planLabel(internalPlan);
}

function accountPlanPrice(account: AccountPlan | null): string {
  if (account?.source === "access_code" || account?.planCode === "tester" || account?.planName === "tester") return "Access code";
  return account?.planCode === "basic" || account?.planName === "basic" ? "$22 / month" : "$32 / month";
}

function formatAccountDate(value?: string): string {
  if (!value) return "your next billing date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "your next billing date";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function safeStripePortalRedirect(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".stripe.com") ? url.toString() : null;
  } catch {
    return null;
  }
}

function PopupCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function AccountPopup({
  kind,
  onKindChange,
  onClose,
  accessToken,
  accountPlan,
  refreshPlan,
}: {
  kind: AccountPopupKind | null;
  onKindChange: (next: AccountPopupKind) => void;
  onClose: () => void;
  accessToken: string;
  accountPlan: AccountPlan | null;
  refreshPlan: () => Promise<AccountPlan | null>;
}) {
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [scheduledChange, setScheduledChange] = useState<{ target: "basic"; effectiveAt: string } | null>(null);

  const displayedPlan = accountPlanLabel(accountPlan);
  const planLimit = accountPlan?.limit ?? (accountPlan?.planCode === "basic" || accountPlan?.planName === "basic" ? 20 : 45);
  const planRemaining = Math.max(0, Math.min(planLimit, accountPlan?.remaining ?? planLimit));
  const planReset = formatAccountDate(accountPlan?.periodEnd);
  const accessCodeExpired = accountPlan?.source === "access_code"
    && accountPlan?.subscriptionStatus !== "active"
    && accountPlan?.subscriptionStatus !== "trialing";
  const planIsRoaring = accountPlan?.source !== "access_code" && (
    accountPlan?.planCode === "premium" || accountPlan?.planName === "premium"
  );
  const planIsPastDue = accountPlan?.subscriptionStatus === "past_due" || accountPlan?.status === "past_due";
  const planChangeIsUpgrade = accountPlan?.planCode === "basic" || accountPlan?.planName === "basic";
  const usageWidth = planRemaining === 0 ? 100 : Math.round((planRemaining / Math.max(1, planLimit)) * 100);

  function openPlanChooser() {
    window.location.assign("/plan");
  }

  async function redeemInviteCode() {
    if (!accessToken || !inviteCode.trim()) return;
    setRedeemingCode(true);
    try {
      await requestPublicProfileApi<{ status: string; planName: string }>(
        "/api/account/redeem-code",
        { method: "POST", accessToken, body: { code: inviteCode } },
      );
      setInviteCode("");
      const refreshed = await refreshPlan();
      setActionMessage(`Access code accepted: ${accountPlanLabel(refreshed)} is active.`);
    } catch (error) {
      const body = (error as { body?: { error?: string } }).body;
      setActionMessage(body?.error || "That code did not work.");
    } finally {
      setRedeemingCode(false);
    }
  }

  async function openBillingPortal() {
    if (!accessToken || actionBusy) return;
    setActionBusy(true);
    setActionMessage("");
    try {
      const result = await requestPublicProfileApi<{ status: string; url: string }>(
        "/api/billing/portal",
        { method: "POST", accessToken },
      );
      const destination = safeStripePortalRedirect(result.url);
      if (!destination) throw new Error("Stripe returned an invalid billing address.");
      window.location.assign(destination);
    } catch {
      setActionMessage("Billing is having a moment. Nothing changed. Try again in a minute.");
      setActionBusy(false);
    }
  }

  async function changeAccountPlan() {
    if (!accessToken || actionBusy || !accountPlan) return;
    const currentPlan = accountPlan.planCode || accountPlan.planName;
    const targetPlan = currentPlan === "basic" ? "premium" : "basic";
    setActionBusy(true);
    setActionMessage("");
    try {
      const result = await requestPublicProfileApi<{
        status: "immediate" | "scheduled" | "unchanged" | "payment_required";
        planCode: string;
        effectiveAt?: string;
      }>(
        "/api/billing/change-plan",
        {
          method: "POST",
          accessToken,
          body: { planCode: targetPlan },
          headers: { "Idempotency-Key": `change:${crypto.randomUUID()}` },
        },
      );
      if (result.status === "scheduled" && result.effectiveAt) {
        setScheduledChange({ target: "basic", effectiveAt: result.effectiveAt });
        setActionMessage(`Your switch to Smoldering is set for ${formatAccountDate(result.effectiveAt)}.`);
      } else if (result.status === "payment_required") {
        setActionMessage("Stripe needs payment attention before this change can finish. Open Billing to update it.");
      } else {
        await refreshPlan();
        onKindChange("plan");
        setActionMessage(targetPlan === "premium" ? "Roaring is active now." : "Your plan is unchanged.");
      }
    } catch (error) {
      const body = error instanceof PublicProfileApiError
        ? error.body as { error?: string; status?: string } | null
        : null;
      setActionMessage(
        body?.status === "payment_required"
          ? "Stripe needs payment attention before this change can finish. Open Billing to update it."
          : "That plan change did not go through. Nothing changed. Try again in a minute.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  if (!kind) return null;

  return (
    <div className={styles.popupOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.popupCard} onClick={(event) => event.stopPropagation()}>
        <div className={`${styles.popupHead} ${kind === "billing" && planIsPastDue ? styles.popupHeadNegative : ""}`}>
          <h3 className={styles.popupTitle}>
            {kind === "change"
              ? planChangeIsUpgrade ? "Upgrade to Roaring" : "Switch to Smoldering"
              : kind === "plan" ? "Plan" : "Billing"}
          </h3>
          <button type="button" className={styles.popupClose} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        {kind === "plan" ? (
          <div className={styles.popupBody}>
            <div className={styles.popupPlanName}>
              <span className={styles.popupPlanTitle}>{displayedPlan}</span>
              {planIsRoaring ? <span className={styles.popupPlanBadge}>Top plan</span> : null}
              <span className={styles.popupPlanPrice}>{accountPlanPrice(accountPlan)}</span>
            </div>
            {accessCodeExpired ? (
              <>
                <p className={styles.popupNote}>Your access-code period has ended. Choose a paid plan to keep using Apply Wizard.</p>
                <div className={styles.popupFoot}>
                  <button type="button" className={styles.popupBtnTeal} onClick={openPlanChooser}>Choose a plan</button>
                  <button type="button" className={styles.popupBtnGhost} onClick={onClose}>Close</button>
                </div>
              </>
            ) : (
              <>
            <div className={styles.popupUsage}>
              <div className={styles.popupUsageTop}><span><b>{planRemaining}</b> of {planLimit} pursuits left</span></div>
              <div className={`${styles.popupMeter} ${planRemaining === 0 ? styles.popupMeterSpent : ""}`}>
                <span style={{ width: `${usageWidth}%` }} />
              </div>
              <div className={styles.popupReset}>Resets on {planReset}.</div>
            </div>
            {planRemaining === 0 ? (
              <p className={styles.popupNote}>You&apos;ve used all {planLimit} this period. Your saved pursuits stay open and trackable. New contact discovery picks back up at reset{planIsRoaring ? "." : ", or step up to Roaring for 45 a month."}</p>
            ) : null}
            <div className={styles.popupKv}>
              <div className={styles.popupKvRow}>
                <span>Markdown export</span>
                {accountPlan?.markdownExport
                  ? <strong className={styles.popupIncluded}><PopupCheckIcon />Included</strong>
                  : <strong className={styles.popupMuted}>Roaring only</strong>}
              </div>
            </div>
            {scheduledChange ? (
              <div className={styles.popupSchedule}>Switching to Smoldering on {formatAccountDate(scheduledChange.effectiveAt)}.</div>
            ) : null}
            {actionMessage ? <p className={styles.popupActionMessage} role="status">{actionMessage}</p> : null}
            <div className={styles.popupFoot}>
              {accountPlan?.hasBillingManagement ? (
                <button type="button" className={styles.popupBtnTeal} onClick={() => { setActionMessage(""); onKindChange("change"); }}>
                  {planRemaining === 0 && !planIsRoaring ? "Upgrade to Roaring" : "Change plan"}
                </button>
              ) : null}
              <button type="button" className={styles.popupBtnGhost} onClick={onClose}>Close</button>
            </div>
              </>
            )}
          </div>
        ) : kind === "billing" ? (
          <div className={styles.popupBody}>
            <div className={styles.popupPlanName}>
              <span className={styles.popupPlanTitle}>{displayedPlan}</span>
              <span className={styles.popupPlanPrice}>{accountPlanPrice(accountPlan)}</span>
            </div>
            {accountPlan?.hasBillingManagement ? (
              <>
                {accountPlan.cancelAtPeriodEnd ? (
                  <div className={styles.popupSchedule}>Set to cancel on {planReset}. You keep full access until then.</div>
                ) : null}
                {planIsPastDue ? (
                  <>
                    <p className={styles.popupNoteNegative}>We couldn&apos;t process your last payment.</p>
                    <p className={styles.popupNote}>New Apply Wizard pursuits and Markdown export are paused until it goes through. Your profile, saved pursuits, and existing work are safe. Update your payment method to pick back up.</p>
                  </>
                ) : (
                  <>
                    <div className={styles.popupKv}>
                      <div className={styles.popupKvRow}><span>Status</span><strong>{accountPlan.cancelAtPeriodEnd ? "Canceling" : "Active"}</strong></div>
                      <div className={styles.popupKvRow}><span>{accountPlan.cancelAtPeriodEnd ? "Access through" : "Next payment"}</span><strong>{planReset}</strong></div>
                    </div>
                    <p className={styles.popupNote}>
                      {accountPlan.cancelAtPeriodEnd
                        ? `Change your mind? Keep your plan and it renews as normal on ${planReset}.`
                        : "Update your payment method, download invoices, or cancel on Stripe's secure portal."}
                    </p>
                  </>
                )}
                {actionMessage ? <p className={styles.popupActionMessage} role="status">{actionMessage}</p> : null}
                <div className={styles.popupFoot}>
                  <button type="button" className={styles.popupBtnTeal} disabled={actionBusy} onClick={() => void openBillingPortal()}>
                    {planIsPastDue ? "Update payment" : accountPlan.cancelAtPeriodEnd ? "Keep my plan" : "Open billing portal"}
                  </button>
                  {!planIsPastDue && !accountPlan.cancelAtPeriodEnd ? (
                    <button type="button" className={styles.popupCancelPlan} disabled={actionBusy} onClick={() => void openBillingPortal()}>
                      Cancel plan
                    </button>
                  ) : (
                    <button type="button" className={styles.popupBtnGhost} onClick={onClose}>Close</button>
                  )}
                </div>
              </>
            ) : (
              <>
                {accessCodeExpired ? (
                  <>
                    <p className={styles.popupNote}>Your access-code period has ended. Choose a paid plan to keep using Apply Wizard.</p>
                    <div className={styles.popupFoot}>
                      <button type="button" className={styles.popupBtnTeal} onClick={openPlanChooser}>Choose a plan</button>
                      <button type="button" className={styles.popupBtnGhost} onClick={onClose}>Close</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.popupNote}>This plan was unlocked with an access code, so there is no Stripe billing account to manage.</p>
                    <label className={styles.accountCodeLabel} htmlFor="billing-access-code">Access code</label>
                    <div className={styles.codeRow}>
                      <input
                        id="billing-access-code"
                        className={styles.codeInput}
                        value={inviteCode}
                        onChange={(event) => setInviteCode(event.target.value)}
                        placeholder="Enter code"
                        type="text"
                        aria-label="Access code"
                      />
                      <button
                        type="button"
                        className={styles.btnRedeem}
                        disabled={redeemingCode || !inviteCode.trim()}
                        onClick={() => void redeemInviteCode()}
                      >
                        Redeem
                      </button>
                    </div>
                    {actionMessage ? <p className={styles.popupActionMessage} role="status">{actionMessage}</p> : null}
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={styles.popupBody}>
            <p className={styles.popupNote}>
              {planChangeIsUpgrade
                ? "You'll pay a prorated amount for the rest of this period today. The pursuits you've already used carry over, your remaining count moves up to fit Roaring's 45, and Markdown export unlocks right away. Your billing date doesn't change."
                : `You keep Roaring, all 45 pursuits, and Markdown export until ${planReset}. At renewal you move to Smoldering: 20 pursuits a month and no export. Nothing changes today and there's no refund for the current period.`}
            </p>
            {planChangeIsUpgrade ? (
              <div className={styles.popupKv}>
                <div className={styles.popupKvRow}><span>New price</span><strong>$32 / month</strong></div>
                <div className={styles.popupKvRow}><span>Due today</span><strong>Prorated, shown on Stripe</strong></div>
                <div className={styles.popupKvRow}><span>Pursuits</span><strong>Jumps to 45 this period</strong></div>
              </div>
            ) : null}
            {actionMessage ? <p className={styles.popupActionMessage} role="status">{actionMessage}</p> : null}
            <div className={styles.popupFoot}>
              <button type="button" className={styles.popupBtnTeal} disabled={actionBusy} onClick={() => void changeAccountPlan()}>
                {actionBusy ? "Working…" : planChangeIsUpgrade ? "Upgrade now" : "Switch at renewal"}
              </button>
              <button type="button" className={styles.popupBtnGhost} disabled={actionBusy} onClick={() => onKindChange("plan")}>
                {planChangeIsUpgrade ? "Not now" : "Keep Roaring"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
