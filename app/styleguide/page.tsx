/* Internal styleguide — renders the shared DS component layer (app/ds.css)
   on the real app ground with the real fonts. Review target for the design bar.
   Not linked from the product; visit /styleguide directly. */

export const metadata = { title: "Styleguide" };

export default function StyleguidePage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px", display: "grid", gap: 40 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <h1 className="ds-display">Dumpster Fire</h1>
        <p className="ds-lede">
          The shared component layer, rendered on the live paper ground. Every public surface
          inherits these. If the bar here is right, it is right everywhere.
        </p>
      </header>

      {/* TYPE */}
      <section className="ds-card" style={{ display: "grid", gap: 16 }}>
        <h2 className="ds-panel-title">Type</h2>
        <div className="ds-display">Display · Bemio</div>
        <div className="ds-h1">Heading 1 · Bemio</div>
        <div className="ds-h2">Heading 2 · Bemio</div>
        <div className="ds-subhead" style={{ fontSize: "1.4rem" }}>Subhead · Bebas tracked caps</div>
        <p className="ds-body" style={{ maxWidth: "60ch" }}>
          Body copy is set in Plantagenet Cherokee, a humanist serif. Anthropomorphized objects,
          energetic flats, and a deliberate off-register misprint define the voice.
        </p>
      </section>

      {/* BUTTONS + LINKS */}
      <section className="ds-card" style={{ display: "grid", gap: 20 }}>
        <h2 className="ds-panel-title">Buttons &amp; links</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <button className="ds-btn" type="button">Primary action</button>
          <button className="ds-btn ds-btn-sm" type="button">Small</button>
          <button className="ds-btn-ghost" type="button">Secondary</button>
          <button className="ds-btn" type="button" disabled>Disabled</button>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          <a className="ds-link" href="#">Hover for the slip</a>
          <a className="ds-link is-active" href="#">Active page</a>
        </div>
      </section>

      {/* PANEL VARIANTS */}
      <section style={{ display: "grid", gap: 20 }}>
        <div className="ds-card">
          <div className="ds-panel-header">
            <h2 className="ds-panel-title">Best matches</h2>
            <span className="ds-badge ds-badge--scan">12 new</span>
          </div>
          <div className="ds-panel-body">
            <p>Ranked by fit against your profile. The strongest matches surface first.</p>
            <p>Last scan ran 14 minutes ago across 9 connected sources.</p>
          </div>
        </div>
      </section>

      {/* FORM */}
      <section className="ds-card ds-form" style={{ display: "grid", gap: 24 }}>
        <h2 className="ds-panel-title">Form controls</h2>
        <div>
          <label htmlFor="sg-title">Target title</label>
          <input id="sg-title" type="text" defaultValue="Senior Product Designer" />
        </div>
        <div>
          <label htmlFor="sg-remote">Remote preference</label>
          <select id="sg-remote" defaultValue="Remote (US)">
            <option>Remote (US)</option>
            <option>Hybrid</option>
            <option>On-site</option>
          </select>
        </div>
        <div>
          <label htmlFor="sg-notes">Notes for matching</label>
          <textarea id="sg-notes" defaultValue="Prioritize design-systems ownership and 0 to 1 product work." />
        </div>
        <div>
          <label>Filter by status</label>
          <div className="ds-filter-row">
            <button className="ds-filter-tab is-active" type="button">All</button>
            <button className="ds-filter-tab" type="button">Saved</button>
            <button className="ds-filter-tab" type="button">Applied</button>
            <button className="ds-filter-tab" type="button">Skipped</button>
          </div>
        </div>
        <p className="ds-callout ds-callout--positive">Preferences saved. Next scan will use these.</p>
        <div><button className="ds-btn" type="button">Save preferences</button></div>
      </section>

      {/* BADGES */}
      <section className="ds-card" style={{ display: "grid", gap: 20 }}>
        <h2 className="ds-panel-title">Badges &amp; tags</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span className="ds-badge ds-badge--saved">Saved</span>
          <span className="ds-badge ds-badge--applied">Applied</span>
          <span className="ds-badge ds-badge--new">New</span>
          <span className="ds-badge ds-badge--skipped">Skipped</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <span className="ds-keyword">Design systems</span>
          <span className="ds-keyword">0 to 1</span>
          <span className="ds-industry">Healthtech</span>
          <span className="ds-missing">Salary missing</span>
        </div>
      </section>

      {/* CALLOUT */}
      <section style={{ display: "grid", gap: 16 }}>
        <p className="ds-callout">
          Without the full picture, outreach will not be good. Finish your profile to unlock scanning.
        </p>
      </section>
    </main>
  );
}
