import Image from "next/image";
import Link from "next/link";
import mascotImg from "./scans/dumpsterfireguy.png";
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

const humanPathSlides = [
  {
    title: "Review role",
    activeStep: 0,
    sections: [
      {
        heading: "Job review",
        copy: "Good Vibes All Day Co. · Senior Product Manager · Remote · Full-time",
        items: ["Fit: Good / 86", "Owns roadmap clarity across product, customer insight, and GTM handoff", "Risk: may skew too growth-ops if discovery ownership is shallow"],
      },
      {
        heading: "Recommended strategy",
        copy: "Lead with product discovery, cross-functional launch rhythm, and turning vague customer signals into shipped roadmap decisions.",
        items: ["Use PM operating examples", "Avoid generic passionate-about-product language"],
      },
    ],
  },
  {
    title: "Contacts",
    activeStep: 1,
    sections: [
      {
        heading: "Contact identification",
        copy: "Research starts with the likely reporting chain: owning product leader, manager layer, functional partner, then recruiter.",
        items: ["Maya Chen · VP Product · Hiring Manager · 91% confidence", "Dev Patel · Director, Product Ops · Functional partner · 74% confidence", "Jordan Lee · Senior Recruiter · Talent partner · 68% confidence"],
      },
    ],
  },
  {
    title: "Outreach",
    activeStep: 2,
    sections: [
      {
        heading: "Tailored outreach message",
        copy: "Maya - saw Good Vibes is hiring a Senior PM to tighten the path from customer signal to shipped product bets. That shape is close to work I have led.",
        items: ["Work example: customer insight to roadmap launch", "Tone: direct, specific, human", "Status: editable draft, not sent"],
      },
    ],
  },
  {
    title: "Tracking",
    activeStep: 3,
    sections: [
      {
        heading: "Pursuit tracking",
        copy: "Saving this screen moves the role into the right pipeline state and keeps outreach context attached.",
        items: ["Opened the company posting", "Messaged Maya Chen", "Saved resume notes", "Follow up in five business days"],
      },
    ],
  },
];

const humanPathSteps = ["Review", "Contacts", "Outreach", "Track"];

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
      <header className={styles.publicLandingNav} aria-label="Dumpster Fire navigation">
        <div className={styles.publicLandingNavLeft}>
          <Link className={styles.publicLandingNavBrand} href="/" aria-label="Dumpster Fire home">
            <Image className={styles.publicLandingNavMark} src={mascotImg} alt="" sizes="40px" />
            <span>Home</span>
          </Link>
          <nav className={styles.publicLandingNavLinks} aria-label="Page sections">
            <a href="#features">Features</a>
            <a href="#human-path">Human Path</a>
            <a href="#subscription">Pricing</a>
            <a href="mailto:fransencomesalive@gmail.com?subject=Dumpster%20Fire">Contact</a>
          </nav>
        </div>
        <div className={styles.publicLandingNavActions}>
          <Link className={styles.publicLandingNavSignIn} href="/onboarding">
            Sign in
          </Link>
          <Link className={styles.publicLandingNavCta} href="/onboarding">
            Create profile
          </Link>
        </div>
      </header>

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

      <section id="human-path" className={styles.publicLandingSection} aria-labelledby="human-path-title">
        <div className={styles.publicLandingSectionIntro}>
          <h2 id="human-path-title">Human Path</h2>
          <p>You can do this on your own. Dumpster Fire packages the steps so you are not rebuilding the same path every morning.</p>
        </div>
        <div className={styles.publicLandingHumanPathShow} aria-label="Human Path preview for a senior product manager role">
          {humanPathSlides.map((slide, index) => (
            <input className={styles.publicLandingHumanPathRadio} defaultChecked={index === 0} id={`human-path-slide-${index + 1}`} key={`${slide.title}-radio`} name="human-path-slide" type="radio" />
          ))}
          <div className={styles.publicLandingHumanPathViewport}>
            <div className={styles.publicLandingHumanPathTrack}>
              {humanPathSlides.map((slide) => (
                <article className={styles.publicLandingHumanPathSlide} key={slide.title} aria-label={`${slide.title} Human Path preview`}>
                  <div className={styles.publicLandingHumanModal}>
                    <div className={styles.publicLandingHumanModalHeader}>
                      <h3>Human Path: Senior Product Manager</h3>
                      <span aria-hidden="true">×</span>
                    </div>
                    <div className={styles.publicLandingHumanWizardSteps} aria-label="Human Path steps">
                      {humanPathSteps.map((label, index) => (
                        <span className={index === slide.activeStep ? styles.publicLandingHumanWizardStepActive : undefined} key={label}>
                          <b>{index + 1}</b>
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className={styles.publicLandingHumanModalStack}>
                      {slide.sections.map((section) => (
                        <section key={section.heading}>
                          <strong>{section.heading}</strong>
                          <p>{section.copy}</p>
                          <ul>
                            {section.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                    <div className={styles.publicLandingHumanModalFooter}>
                      <span>Open job posting</span>
                      <strong>{slide.activeStep === 3 ? "Save pursuit" : "Continue"}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.publicLandingHumanPathArrows} aria-label="Human Path slideshow controls">
            {humanPathSlides.map((slide, index) => {
              const previousSlide = index === 0 ? humanPathSlides.length : index;
              const nextSlide = index === humanPathSlides.length - 1 ? 1 : index + 2;

              return (
                <div className={styles.publicLandingHumanPathArrowSet} key={`${slide.title}-arrows`}>
                  <label htmlFor={`human-path-slide-${previousSlide}`} aria-label="Previous Human Path slide">←</label>
                  <span>Slide {index + 1} of {humanPathSlides.length}</span>
                  <label htmlFor={`human-path-slide-${nextSlide}`} aria-label="Next Human Path slide">→</label>
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
        <Link className={styles.publicLandingPrimary} href="/onboarding">
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
