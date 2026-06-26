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
    copy: "Add identity, search constraints, role tracks, resumes, work history, proof, skills, writing, and outreach rules.",
  },
  {
    title: "Compile",
    copy: "Turn those inputs into a structured Career Operating System profile.",
  },
  {
    title: "Review",
    copy: "Resolve incomplete or weak sections before the product uses the profile downstream.",
  },
  {
    title: "Activate",
    copy: "Use the completed profile as the basis for matching, proof selection, Human Path, and outreach.",
  },
  {
    title: "Improve",
    copy: "Keep the profile current as your search, proof, and role targets change.",
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
    title: "Profile foundation",
    items: ["Identity and search basics", "Role Tracks", "Resume and work history review", "Proof Library", "Voice and outreach rules"],
  },
  {
    title: "Pursuit intelligence",
    items: ["Match labels", "Role Track recommendation", "Resume recommendation", "Proof-object selection", "Risk explanation"],
  },
  {
    title: "Human Path workflow",
    items: ["Hiring path research", "Contact selection", "Contact-specific outreach", "Pursuit tracking", "Usage-aware generation"],
  },
];

const accessStates = [
  {
    title: "Profile setup",
    price: "Available in beta",
    copy: "Create the structured Career Operating System profile that future matching, proof selection, and outreach depend on.",
  },
  {
    title: "Private scan workspace",
    price: "Access-code gated",
    copy: "The mature search and tuning machinery remains private while public Saved Jobs, Pursuits, and Human Path are rebuilt against public profiles.",
  },
  {
    title: "Public pursuit workflow",
    price: "Coming next",
    copy: "Saved Jobs, Pursuits, matching, Human Path, outreach, and subscription limits will open after the profile foundation is stable.",
  },
];

const guardrails = [
  "No mass apply automation.",
  "No private scan defaults in public profiles.",
  "No raw resume storage without a deliberate user-facing flow.",
  "No pursuit or outreach generation until a profile is complete.",
  "No hiding weak-fit or excluded roles without explanation.",
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
          <a href="#access">Access</a>
          <Link href="/onboarding">Build profile</Link>
          <a href="mailto:randall@randallfransen.com?subject=Dumpster%20Fire%20beta">Contact</a>
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
            The first public workflow is profile creation. The current onboarding path covers the profile sections that matching, proof selection, Human Path, and outreach will depend on.
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
          <p className={styles.publicLandingKicker}>Product map</p>
          <h2 id="feature-set-title">The profile is the first product surface.</h2>
          <p>Public onboarding is the foundation. Matching, Saved Jobs, Pursuits, Human Path, outreach, subscriptions, and pursued-jobs export build from the same structured profile.</p>
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

      <section id="access" className={styles.publicLandingSection} aria-labelledby="access-title">
        <div className={styles.publicLandingSectionIntro}>
          <p className={styles.publicLandingKicker}>Access</p>
          <h2 id="access-title">The public app opens in layers.</h2>
          <p>Profile setup is the active public foundation. The private scan workspace stays gated while public pursuit workflows are rebuilt on the new profile model.</p>
        </div>
        <div className={styles.publicLandingPricingGrid}>
          {accessStates.map((tier) => (
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
        <p>Start with the profile. Every better pursuit needs a better source of truth.</p>
        <Link className={styles.publicLandingPrimary} href="/onboarding">
          Build my profile
        </Link>
      </section>
    </main>
  );
}
