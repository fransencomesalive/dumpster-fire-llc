import Image from "next/image";
import Link from "next/link";
import mascotImg from "./dumpsterfireguy.png";
import SiteHeader from "./components/SiteHeader";
import styles from "./site.module.css";

const operatingLoop = [
  {
    title: "Build your profile",
    copy: "Turn your resumes, work examples, and voice into the profile every message is built from.",
  },
  {
    title: "Scan real sources",
    copy: "Scan live job boards and company career pages, so your search is not trapped inside one portal or one watchlist.",
  },
  {
    title: "1:1 custom outreach",
    copy: "Dumpster Fire finds the person to contact and drafts a powerful, informative message in your voice. Editable, never auto-sent.",
  },
  {
    title: "Track your pursuits",
    copy: "Keep every role, contact, and message in one place as you follow up.",
  },
];

// Approved DS card components/home-human-path.html (r3, 2026-07-15): 5-slide
// whole-app walkthrough — each slide borrows the real product surface it describes.
const humanPathSteps = ["Profile", "Pursuits", "Your Human", "Message", "Records"];
const humanPathSlideCount = 5;

const subscriptionTiers = [
  { name: "Good", price: "" },
  { name: "Gooder", price: "" },
  { name: "Goodest", price: "" },
];

type TierCell = boolean | string;

const subscriptionFeatures: { label: string; tiers: [TierCell, TierCell, TierCell] }[] = [
  { label: "Career profile in your voice", tiers: [true, true, true] },
  { label: "Work examples, woven into your outreach", tiers: [true, true, true] },
  { label: "Match ratings on every role", tiers: [false, true, true] },
  { label: "Saved jobs", tiers: [false, true, true] },
  { label: "Contact discovery: customized outreach", tiers: [false, true, true] },
  { label: "Generate custom outreach (1 per contact)", tiers: [false, false, true] },
  { label: "Pursuit tracking", tiers: [false, false, true] },
  { label: "Export history", tiers: [false, false, true] },
  { label: "Jobs you can pursue each month", tiers: [false, false, "50"] },
];

export default function HomePage() {
  return (
    <main className={styles.publicLandingPage}>
      <SiteHeader />

      <section className={styles.publicLandingHeroSection} aria-labelledby="home-title">
        <div className={styles.publicLandingHeroInner}>
          <Image className={styles.publicLandingMascot} src={mascotImg} alt="" priority sizes="(max-width: 820px) 210px, 320px" />
          <div className={styles.publicLandingHeroCopy}>
            <p className={styles.publicLandingLabel}>The Job Market Is A</p>
            <h1 className={styles.publicLandingWordmark} id="home-title">
              <span className={styles.publicLandingWordmarkBase}>Dumpster Fire</span>
              <span className={styles.publicLandingWordmarkSlip} aria-hidden="true">Dumpster Fire</span>
            </h1>
            <div className={styles.publicLandingHeroRule} aria-hidden="true">
              <span />
            </div>
            <p className={styles.publicLandingSubhead}>
              A job-search operating system for people who are done feeding the machine.
            </p>
            <p className={styles.publicLandingIntro}>
              Job boards and ATS&apos;s are where good candidates disappear. Dumpster Fire scans boards, company pages, and targeted sources, surfaces likely hiring contacts, and helps you reach out with your work examples and voice.
            </p>
            <div className={styles.publicLandingHeroSigns} aria-label="Search posture">
              <span className={styles.publicLandingSignTomato}>Stop applying</span>
              <span className={styles.publicLandingSignTeal}>Start pursuing</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className={styles.publicLandingSection} aria-labelledby="operating-loop-title">
        <div className={styles.publicLandingSectionIntro}>
          <h2 id="operating-loop-title">Is the Job Market a Dumpster Fire?</h2>
          <p>
            Yup. Sending 100 resumes a day into the ATS black hole is no way to pay the bills. Outside of a direct reference, the best bet is to make that connection yourself.
          </p>
        </div>
        <div className={styles.publicLandingLoopGrid}>
          {operatingLoop.map((item, index) => (
            <article className={styles.publicLandingLoopItem} key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="human-path" className={`${styles.publicLandingSection} ${styles.publicLandingHumanPathSection}`} aria-labelledby="human-path-title">
        <div className={styles.publicLandingHowIntro}>
          <Image className={styles.publicLandingHowIntroMascot} src={mascotImg} alt="" sizes="128px" />
          <div className={styles.publicLandingSectionIntro}>
            <h2 id="human-path-title">How Dumpster Fire works</h2>
            <p>Five steps between you and a real person reading a message that actually sounds like you. Not a portal. Not a resume black hole. A person.</p>
          </div>
        </div>
        <div className={styles.publicLandingHumanPathShow} aria-label="How Dumpster Fire works, five-step walkthrough">
          {humanPathSteps.map((label, index) => (
            <input className={styles.publicLandingHumanPathRadio} defaultChecked={index === 0} id={`human-path-slide-${index + 1}`} key={`${label}-radio`} name="human-path-slide" type="radio" />
          ))}
          <div className={styles.publicLandingHumanPathViewport}>
            <div className={styles.publicLandingHumanPathTrack}>

              {/* Slide 1 · Profile */}
              <article className={styles.publicLandingHumanPathSlide} aria-label="Submit your profile">
                <div className={styles.publicLandingHumanPanel}>
                  <div className={styles.publicLandingHumanPanelHeader}>
                    <h3>Submit your profile</h3>
                  </div>
                  <div className={styles.publicLandingHumanWizardSteps} aria-label="How Dumpster Fire works steps">
                    {humanPathSteps.map((label, index) => (
                      <label className={index === 0 ? styles.publicLandingHumanWizardStepActive : undefined} htmlFor={`human-path-slide-${index + 1}`} key={label}>
                        <b>{index + 1}</b>
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className={styles.publicLandingHumanPanelStack}>
                    <section>
                      <p>Hand over your résumé as a clean PDF so the scan reads it right. We pull the substance out and toss the file. Then add work examples: what you built, where it lives, and the dent it made.</p>
                    </section>
                    <section className={styles.publicLandingHumanSubBox}>
                      <strong>Résumé scanned</strong>
                      <p>Text captured. File discarded. Your history stays yours.</p>
                    </section>
                    <section className={styles.publicLandingHumanResumeSheet}>
                      <span className={styles.publicLandingHumanResumeSheetTag}>From your résumé</span>
                      <div className={styles.publicLandingHumanResumeSheetHead}>
                        <strong>Senior Producer · Topo Chico</strong>
                        <span>2022 to 2025</span>
                      </div>
                      <ul>
                        <li>Led national launch production across 40+ SKUs; shipped in one quarter.</li>
                        <li>Owned it from first render to shelf date; beat the sell-in target by 22%.</li>
                      </ul>
                    </section>
                  </div>
                </div>
              </article>

              {/* Slide 2 · Pursuits */}
              <article className={styles.publicLandingHumanPathSlide} aria-label="Line up your pursuits">
                <div className={styles.publicLandingHumanPanel}>
                  <div className={styles.publicLandingHumanPanelHeader}>
                    <h3>Line up your pursuits</h3>
                  </div>
                  <div className={styles.publicLandingHumanWizardSteps} aria-label="How Dumpster Fire works steps">
                    {humanPathSteps.map((label, index) => (
                      <label className={index === 1 ? styles.publicLandingHumanWizardStepActive : undefined} htmlFor={`human-path-slide-${index + 1}`} key={label}>
                        <b>{index + 1}</b>
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className={styles.publicLandingHumanPanelStack}>
                    <section>
                      <p>Scan the boards we watch, rated against your profile. Or found a posting in the wild? Paste the link. Either way, a job stops being a listing and becomes a pursuit: something you go after on purpose.</p>
                    </section>
                    <section className={styles.publicLandingHumanSubBox}>
                      <strong>Senior Producer · Liquid Death</strong>
                      <p>Fit: Good / 88. Strong overlap on creative production and launch delivery.</p>
                    </section>
                    <div className={styles.publicLandingHumanOrDivider}>Or paste a job you found on your own</div>
                    <div className={styles.publicLandingHumanLinkRow}>
                      <span className={styles.publicLandingHumanLinkInput}>Paste a job posting link</span>
                      <span className={styles.publicLandingHumanLinkBtn}>Pursue</span>
                    </div>
                  </div>
                </div>
              </article>

              {/* Slide 3 · Your Human */}
              <article className={styles.publicLandingHumanPathSlide} aria-label="We find a human to contact">
                <div className={styles.publicLandingHumanPanel}>
                  <div className={styles.publicLandingHumanPanelHeader}>
                    <h3>We find a human to contact</h3>
                  </div>
                  <div className={styles.publicLandingHumanWizardSteps} aria-label="How Dumpster Fire works steps">
                    {humanPathSteps.map((label, index) => (
                      <label className={index === 2 ? styles.publicLandingHumanWizardStepActive : undefined} htmlFor={`human-path-slide-${index + 1}`} key={label}>
                        <b>{index + 1}</b>
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className={styles.publicLandingHumanPanelStack}>
                    <section>
                      <p>Job postings hide people. Dumpster Fire works out who actually owns this role, hiring manager to recruiter, and you pick who receives your message.</p>
                      <p className={styles.publicLandingHumanSuccess}>Found 2 reporting-chain contacts.</p>
                    </section>
                    <div className={styles.publicLandingHumanContact}>
                      <input defaultChecked type="checkbox" />
                      <span>
                        <strong>Sam Lewis</strong>
                        <em>VP, Brand &amp; Creative · Hiring Manager</em>
                        <b>★★★★☆ · 82% confidence · Verified</b>
                        <small>Owns the function this role reports into; confirmed current at Liquid Death.</small>
                      </span>
                    </div>
                    <div className={styles.publicLandingHumanContact}>
                      <input type="checkbox" />
                      <span>
                        <strong>Willem Blom</strong>
                        <em>Senior Recruiter · Recruiter</em>
                        <b>★★★☆☆ · 64% confidence · Unverified lead</b>
                        <small>Confirm this person before reaching out.</small>
                      </span>
                    </div>
                  </div>
                </div>
              </article>

              {/* Slide 4 · Message */}
              <article className={styles.publicLandingHumanPathSlide} aria-label="A message in your voice">
                <div className={styles.publicLandingHumanPanel}>
                  <div className={styles.publicLandingHumanPanelHeader}>
                    <h3>A message in your voice</h3>
                  </div>
                  <div className={styles.publicLandingHumanWizardSteps} aria-label="How Dumpster Fire works steps">
                    {humanPathSteps.map((label, index) => (
                      <label className={index === 3 ? styles.publicLandingHumanWizardStepActive : undefined} htmlFor={`human-path-slide-${index + 1}`} key={label}>
                        <b>{index + 1}</b>
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className={styles.publicLandingHumanPanelStack}>
                    <section>
                      <p>Written from your profile in your tone, with your work examples doing the talking. Copy it, then paste it into your message to the recruiter or hiring manager. It reads like you because it is you.</p>
                    </section>
                    <section>
                      <div className={styles.publicLandingHumanCopyHeader}>
                        <strong>Sam Lewis</strong>
                        <span className={styles.publicLandingHumanCopyBtn}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                          <span>Copy</span>
                        </span>
                      </div>
                      <p className={styles.publicLandingHumanMessage}>Hi Sam, I produced Topo Chico&apos;s launch end to end and shipped it across 40+ SKUs in a quarter. Liquid Death&apos;s Senior Producer role looks like the same problem at a louder volume. Worth a short conversation?</p>
                    </section>
                  </div>
                </div>
              </article>

              {/* Slide 5 · Records */}
              <article className={styles.publicLandingHumanPathSlide} aria-label="Save it for your records">
                <div className={styles.publicLandingHumanPanel}>
                  <div className={styles.publicLandingHumanPanelHeader}>
                    <h3>Save it for your records</h3>
                    <span className={styles.publicLandingHumanComingSoon}>Coming Soon</span>
                  </div>
                  <div className={styles.publicLandingHumanWizardSteps} aria-label="How Dumpster Fire works steps">
                    {humanPathSteps.map((label, index) => (
                      <label className={index === 4 ? styles.publicLandingHumanWizardStepActive : undefined} htmlFor={`human-path-slide-${index + 1}`} key={label}>
                        <b>{index + 1}</b>
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className={styles.publicLandingHumanPanelStack}>
                    <section>
                      <p>Every pursuit keeps its own paper trail: who you messaged, what you sent, what happened next. When the recruiter finally calls back in three weeks, you will know exactly where you left off.</p>
                    </section>
                    <div className={styles.publicLandingHumanChecklist}>
                      <label><input defaultChecked type="checkbox" /><span>Messaged Sam Lewis</span></label>
                      <label><input defaultChecked type="checkbox" /><span>Applied online</span></label>
                      <label><input type="checkbox" /><span>Heard back</span></label>
                      <label><input type="checkbox" /><span>Saved for follow-up</span></label>
                    </div>
                  </div>
                </div>
              </article>

            </div>
          </div>
          <div className={styles.publicLandingHumanPathArrows} aria-label="Walkthrough slideshow controls">
            {humanPathSteps.map((label, index) => {
              const previousSlide = index === 0 ? humanPathSlideCount : index;
              const nextSlide = index === humanPathSlideCount - 1 ? 1 : index + 2;

              return (
                <div className={styles.publicLandingHumanPathArrowSet} key={`${label}-arrows`}>
                  <label htmlFor={`human-path-slide-${previousSlide}`} aria-label="Previous slide">←</label>
                  <span>Slide {index + 1} of {humanPathSlideCount}</span>
                  <label htmlFor={`human-path-slide-${nextSlide}`} aria-label="Next slide">→</label>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="subscription" className={styles.publicLandingSection} aria-labelledby="subscription-title">
        <div className={styles.publicLandingSectionIntro}>
          <h2 id="subscription-title">Subscription tiers.</h2>
        </div>
        <div className={styles.publicLandingTierTableWrap}>
          <table className={styles.publicLandingTierTable}>
            <thead>
              <tr>
                <th scope="col" aria-label="Feature" />
                {subscriptionTiers.map((tier) => (
                  <th scope="col" key={tier.name}>
                    <span className={styles.publicLandingTierName}>{tier.name}</span>
                    {tier.price ? <span className={styles.publicLandingTierPrice}>{tier.price}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscriptionFeatures.map((feature) => (
                <tr key={feature.label}>
                  <th scope="row">{feature.label}</th>
                  {feature.tiers.map((cell, index) => (
                    <td key={subscriptionTiers[index].name}>
                      {cell === true ? (
                        <span className={styles.publicLandingTierYes} role="img" aria-label="Included">✓</span>
                      ) : cell === false ? (
                        <span className={styles.publicLandingTierNo} role="img" aria-label="Not included" />
                      ) : (
                        <span className={styles.publicLandingTierValue}>{cell}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.publicLandingFinal} aria-label="Request Dumpster Fire access">
        <h2>When the market is noisy, the workflow has to be calmer.</h2>
        <p>Start with the profile. Every better pursuit needs a better source of truth.</p>
        <Link className={styles.publicLandingPrimary} href="/signup">
          Build my profile
        </Link>
      </section>

      <footer className={styles.publicLandingFooter} aria-label="Site footer">
        <div className={styles.publicLandingFooterMain}>
          <Link className={styles.publicLandingFooterBrand} href="/" aria-label="Dumpster Fire home">
            <Image className={styles.publicLandingFooterMark} src={mascotImg} alt="" sizes="40px" />
            <span className={styles.publicLandingFooterWord}>
              <span className={styles.publicLandingFooterWordTop}>The Job Market Is A</span>
              <span className={styles.publicLandingFooterWordName}>Dumpster Fire</span>
            </span>
          </Link>
          <nav className={styles.publicLandingFooterNav} aria-label="Footer">
            <a href="mailto:fransencomesalive@gmail.com?subject=Dumpster%20Fire">Contact Us</a>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/billing">Billing</Link>
            <Link href="/legal/contact">Support</Link>
          </nav>
        </div>
        <div className={styles.publicLandingFooterFine}>
          <span>
            {"© 2026 Dumpster Fire"}
            <span className={styles.publicLandingFooterDot} aria-hidden="true" />
            {"Stop applying. Start pursuing."}
          </span>
          <span>{"Built for people done feeding the machine."}</span>
        </div>
      </footer>
    </main>
  );
}
