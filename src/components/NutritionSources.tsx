import { useState } from "react";

// Citations backing the nutrition/macro calculations. Surfaced in-app so the
// methodology behind every calorie and macro number is easy for users to find.

interface SourceEntry {
  topic: string;
  description: string;
  citation: string;
  url: string;
}

const SOURCES: SourceEntry[] = [
  {
    topic: "Basal Metabolic Rate (BMR)",
    description: "Mifflin-St Jeor equation.",
    citation:
      "Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. American Journal of Clinical Nutrition. 1990;51(2):241-247.",
    url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  },
  {
    topic: "Total Daily Energy Expenditure (TDEE)",
    description: "BMR multiplied by a physical activity factor.",
    citation:
      "Food and Agriculture Organization/World Health Organization/United Nations University. Human energy requirements. 2001.",
    url: "https://www.fao.org/3/y5686e/y5686e00.htm",
  },
  {
    topic: "Calorie targets for fat loss / muscle gain",
    description: "Moderate energy deficit/surplus (approx. 18% deficit, 10% surplus).",
    citation:
      "Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. Journal of the International Society of Sports Nutrition. 2014;11:20.",
    url: "https://pubmed.ncbi.nlm.nih.gov/24864135/",
  },
  {
    topic: "Protein recommendations",
    description: "1.6–2.4 g/kg bodyweight depending on goal.",
    citation:
      "Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. Journal of the International Society of Sports Nutrition. 2017;14:20.",
    url: "https://pubmed.ncbi.nlm.nih.gov/28642676/",
  },
];

const DISCLAIMER =
  "This information is for general educational purposes only and is not medical or dietary advice. Individual needs vary. Consult a registered dietitian or physician before making significant changes to your diet, especially if you have any medical conditions.";

// Native iOS/Android: "_system" opens the OS browser (no @capacitor/browser plugin).
function openLink(url: string) {
  window.open(url, "_system");
}

export default function NutritionSources() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-glass)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        <span>📚 Sources &amp; Methodology</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Always-visible note — citation existence is clear without any interaction */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 6, padding: "0 2px" }}>
        Calorie and macro targets are based on peer-reviewed formulas (Mifflin-St Jeor, ISSN). Tap to view sources.
      </div>

      {open && (
        <div
          className="card"
          style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 14 }}
        >
          {SOURCES.map((s) => (
            <div key={s.topic} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                {s.topic}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.description}</div>
              <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.5 }}>
                {s.citation}
              </div>
              <a
                href={s.url}
                onClick={(e) => {
                  e.preventDefault();
                  openLink(s.url);
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--accent-blue)",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                View source ↗
              </a>
            </div>
          ))}

          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.6,
              paddingTop: 10,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {DISCLAIMER}
          </div>
        </div>
      )}
    </div>
  );
}
