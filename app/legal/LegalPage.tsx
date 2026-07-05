import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../site.module.css";

type LegalSection = {
  heading: string;
  body: string[];
  list?: string[];
};

type LegalPageProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
  footerNote?: string;
  relatedLinks?: Array<{ href: string; label: string }>;
  children?: ReactNode;
};

export default function LegalPage({ title, intro, sections, footerNote, relatedLinks, children }: LegalPageProps) {
  return (
    <main className={styles.publicLegalPage}>
      <div className={styles.publicLegalShell}>
        <header className={styles.publicLegalHeader}>
          <Link className={styles.publicLegalBack} href="/">
            ← Back to Dumpster Fire
          </Link>
          <div>
            <p className={styles.publicLegalEyebrow}>Public product pages</p>
            <h1>{title}</h1>
            <p className={styles.publicLegalIntro}>{intro}</p>
          </div>
        </header>

        {children ? <section className={styles.publicLegalCallout}>{children}</section> : null}

        <section className={styles.publicLegalContent} aria-label={title}>
          {sections.map((section) => (
            <article className={styles.publicLegalSection} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.list ? (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>

        {relatedLinks && relatedLinks.length > 0 ? (
          <aside className={styles.publicLegalSidebar} aria-label="Related legal pages">
            <h2>Related pages</h2>
            <ul>
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {footerNote ? <p className={styles.publicLegalFootnote}>{footerNote}</p> : null}
      </div>
    </main>
  );
}
