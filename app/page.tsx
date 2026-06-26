import Image from "next/image";
import Link from "next/link";
import HomeAuthRouter from "./HomeAuthRouter";
import LandingBackground from "./LandingBackground";
import mascotImg from "./scans/dumpsterfireguy.png";
import styles from "./site.module.css";

const operatingLoop = [
  {
    title: "Build your profile",
    copy: "Turn resumes, work examples, writing style, requirements, and wrong-lane signals into a better search filter.",
  },
  {
    title: "Search broad and targeted sources",
    copy: "Scan job boards and company career pages together so the search is not trapped inside one portal or one watchlist.",
  },
  {
    title: "Filter and improve",
    copy: "Ratings and review feedback tighten the scan after bad matches, stale roles, mismatched titles, or wrong responsibilities.",
  },
  {
    title: "Outreach with character",
    copy: "Use your proof and your voice to reach recruiters or hiring managers with specific context. No automated application blasts.",
  },
];

const onboardingFlow = [
  {
    title: "Intake",
    copy: "Add resume material, profile notes, target titles, applying-as tracks, constraints, wants, avoids, and work examples.",
  },
  {
    title: "Compile",
    copy: "Turn the intake into a structured candidate profile, matching rules, proof signals, and missing-input prompts.",
  },
  {
    title: "Review",
    copy: "Check strengths, weak-fit signals, proof objects, target titles, and missing details before the matcher starts using them.",
  },
  {
    title: "Activate",
    copy: "Use the profile to scope scans, source checks, contact research, outreach, feedback, and application history.",
  },
  {
    title: "Improve",
    copy: "Keep tuning the search with ratings and better evidence instead of letting the system guess.",
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
        copy: "Maya — saw Good Vibes is hiring a Senior PM to tighten the path from customer signal to shipped product bets. That shape is close to work I have led.",
        items: ["Proof object: customer insight to roadmap launch", "Tone: direct, specific, human", "Status: editable draft, not sent"],
      },
    ],
  },
  {
    title: "Tracking",
    activeStep: 3,
    sections: [
      {
        heading: "Application tracking",
        copy: "Saving this screen moves the role into the right pipeline state and keeps outreach context attached.",
        items: ["Applied through company portal", "Messaged Maya Chen", "Saved resume notes", "Follow up in five business days"],
      },
    ],
  },
];

const humanPathSteps = ["Review", "Contacts", "Outreach", "Track"];

const featureSets = [
  {
    title: "Profile and fit engine",
    items: ["Resume/profile compiler", "Candidate dossier support", "Applying-as modes", "Wrong-lane evidence", "Profile-scoped matching"],
  },
  {
    title: "Search coverage",
    items: ["Broad job-source scans", "Target company watchlist", "ATS source normalization", "Duplicate cleanup", "Source health reporting"],
  },
  {
    title: "Application workflow",
    items: ["Contact research", "Proof-object selection", "Tailored outreach", "Application checklist", "Previous applications"],
  },
];

const pricingTiers = [
  {
    title: "Private beta",
    price: "Access by invite",
    copy: "For active searches that need hands-on setup, profile calibration, source QA, and feedback before self-serve opens.",
  },
  {
    title: "Solo search",
    price: "Self-serve waitlist",
    copy: "For one candidate profile with compiled matching, broad scans, target-company sources, application workspace, and saved history.",
  },
  {
    title: "Power search",
    price: "Upgrade path",
    copy: "For higher scan volume, exportable activity history, richer source monitoring, and metered integrations once the core profile works.",
  },
];

const guardrails = [
  "No mass apply automation.",
  "No public default profile or private candidate leakage.",
  "No raw resume storage unless the user chooses it.",
  "No scan writes until onboarding creates a real matcher.",
  "No confusing review labels beyond Match, Good, Stretch, and Not a Match.",
];

export default function HomePage() {
  return (
    <main className={styles.publicLandingPage}>
      <HomeAuthRouter />
      <LandingBackground />

      <header className={styles.publicLandingNav} aria-label="Dumpster Fire navigation">
        <Link className={styles.publicLandingNavBrand} href="/">
          Dumpster Fire
        </Link>
        <nav className={styles.publicLandingNavLinks} aria-label="Public sections">
          <a href="#features">Features</a>
          <a href="#human-path">Human Path</a>
          <a href="#pricing">Pricing</a>
          <Link href="/scans">Log in</Link>
          <a href="mailto:randall@randallfransen.com?subject=Dumpster%20Fire%20access">Request access</a>
        </nav>
      </header>

      <section className={styles.publicLandingHeroSection} aria-labelledby="home-title">
        <div className={styles.publicLandingHeroInner}>
          <div className={styles.publicLandingHeroCopy}>
            <p className={styles.publicLandingLabel}>Dumpster Fire</p>
            <h1 id="home-title">The Job Market Is A Dumpster Fire</h1>
            <p className={styles.publicLandingIntro}>
              A job-search operating system for people who are done feeding the machine.
            </p>
            <p className={styles.publicLandingIntro}>
              Job boards and ATS&apos;s are where good candidates disappear. Dumpster Fire scans roles, finds hiring managers, and helps you reach out with your voice and relevant work experience: fewer tabs, better messaging, and a clearer record of what actually happened.
            </p>
            <p className={styles.publicLandingIntro}>Stop applying. Start pursuing.</p>
            <div className={styles.publicLandingActions} aria-label="Dumpster Fire actions">
              <a className={styles.publicLandingPrimary} href="mailto:randall@randallfransen.com?subject=Dumpster%20Fire%20access">
                Request access
              </a>
            </div>
          </div>
          <div className={styles.publicLandingMascotWrap} aria-hidden="true">
            <Image className={styles.publicLandingMascot} src={mascotImg} alt="" priority sizes="(max-width: 820px) 180px, 280px" />
          </div>
        </div>

        <div className={styles.publicLandingHeroStrip} aria-label="Product promise">
          <span>Detailed extrapolation of your experience</span>
          <span>Search job boards &amp; add companies to watch</span>
          <span>AI-supported Human Path for outreach</span>
          <span>Application tracking</span>
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

      <section className={styles.publicLandingSection} aria-labelledby="onboarding-title">
        <div className={styles.publicLandingSectionIntro}>
          <h2 id="onboarding-title">Onboarding</h2>
          <p>
            New users need a clean first pass through profile setup. Returning users need fast access to scanning, source management, saved roles, outreach, and application history.
          </p>
        </div>
        <div className={styles.publicLandingOnboardingFlow} aria-label="Onboarding flow">
          {onboardingFlow.map((step, index) => (
            <article className={styles.publicLandingOnboardingStep} key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="human-path" className={styles.publicLandingSection} aria-labelledby="human-path-title">
        <div className={styles.publicLandingSectionIntro}>
          <h2 id="human-path-title">Human Path</h2>
          <p>You can do this on your own. Dumpster Fire packages the steps so you are not rebuilding the same path every morning.</p>
        </div>
        <div className={styles.publicLandingHumanPathShow} aria-label="Mock Human Path slideshow for a senior product manager role">
          {humanPathSlides.map((slide, index) => (
            <input className={styles.publicLandingHumanPathRadio} defaultChecked={index === 0} id={`human-path-slide-${index + 1}`} key={`${slide.title}-radio`} name="human-path-slide" type="radio" />
          ))}
          <div className={styles.publicLandingHumanPathViewport}>
            <div className={styles.publicLandingHumanPathTrack}>
              {humanPathSlides.map((slide) => (
                <article className={styles.publicLandingHumanPathSlide} key={slide.title} aria-label={`${slide.title} modal mockup`}>
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

      <section className={styles.publicLandingSection} aria-labelledby="feature-set-title">
        <div className={styles.publicLandingSectionIntro}>
          <p className={styles.publicLandingKicker}>Feature sets</p>
          <h2 id="feature-set-title">Match cards are only the first decision point.</h2>
          <p>The product combines profile compilation, source coverage, contact research, outreach generation, application tracking, feedback, and export-ready history.</p>
        </div>
        <div className={styles.publicLandingFeatureSetGrid}>
          {featureSets.map((featureSet) => (
            <article className={styles.publicLandingFeatureSet} key={featureSet.title}>
              <h3>{featureSet.title}</h3>
              <ul>
                {featureSet.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className={styles.publicLandingSection} aria-labelledby="pricing-title">
        <div className={styles.publicLandingSectionIntro}>
          <p className={styles.publicLandingKicker}>Pricing and access</p>
          <h2 id="pricing-title">Access follows the maturity of the search.</h2>
          <p>The current public model separates hands-on beta users, solo self-serve searches, and higher-volume power users.</p>
        </div>
        <div className={styles.publicLandingPricingGrid}>
          {pricingTiers.map((tier) => (
            <article className={styles.publicLandingPricingCard} key={tier.title}>
              <h3>{tier.title}</h3>
              <strong>{tier.price}</strong>
              <p>{tier.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.publicLandingBand} aria-labelledby="guardrails-title">
        <div className={styles.publicLandingBandCopy}>
          <p className={styles.publicLandingKicker}>Guardrails</p>
          <h2 id="guardrails-title">Built for trust before scale.</h2>
          <p>The product keeps the human in the loop and treats profile data, outreach context, and source quality as things that need proof.</p>
        </div>
        <ul className={styles.publicLandingGuardrailList}>
          {guardrails.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.publicLandingFinal} aria-label="Request Dumpster Fire access">
        <h2>When the market is noisy, the workflow has to be calmer.</h2>
        <p>Dumpster Fire keeps the search, the evidence, and the follow-through in one place.</p>
        <a className={styles.publicLandingPrimary} href="mailto:randall@randallfransen.com?subject=Dumpster%20Fire%20access">
          Request access
        </a>
      </section>
    </main>
  );
}
