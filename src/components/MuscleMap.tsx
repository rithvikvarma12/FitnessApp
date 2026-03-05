export type MuscleMapProps = {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  size?: number;
};

type MProps = { fill: string; opacity: number };

function mp(id: string, primary: string[], secondary: string[]): MProps {
  if (primary.includes(id)) return { fill: "#ef4444", opacity: 0.82 };
  if (secondary.includes(id)) return { fill: "#f97316", opacity: 0.55 };
  return { fill: "currentColor", opacity: 0.15 };
}

// Shared silhouette background props
const BG: MProps = { fill: "currentColor", opacity: 0.12 };

// Shared body silhouette shapes (front + back use the same outline)
function BodySilhouette() {
  return (
    <g {...BG}>
      {/* Head */}
      <circle cx="50" cy="13" r="10.5" />
      {/* Neck */}
      <rect x="45" y="22" width="10" height="10" rx="3" />
      {/* Torso */}
      <ellipse cx="50" cy="68" rx="25" ry="34" />
      {/* Hips */}
      <ellipse cx="50" cy="109" rx="22" ry="11" />
      {/* L upper arm */}
      <ellipse cx="18" cy="67" rx="7" ry="16" />
      {/* R upper arm */}
      <ellipse cx="82" cy="67" rx="7" ry="16" />
      {/* L forearm */}
      <ellipse cx="14" cy="93" rx="5.5" ry="13" />
      {/* R forearm */}
      <ellipse cx="86" cy="93" rx="5.5" ry="13" />
      {/* L thigh */}
      <ellipse cx="39" cy="138" rx="12" ry="22" />
      {/* R thigh */}
      <ellipse cx="61" cy="138" rx="12" ry="22" />
      {/* L shin */}
      <ellipse cx="37" cy="169" rx="8" ry="14" />
      {/* R shin */}
      <ellipse cx="63" cy="169" rx="8" ry="14" />
    </g>
  );
}

function BodyFront({ p, s }: { p: string[]; s: string[] }) {
  const m = (id: string) => mp(id, p, s);
  return (
    <svg viewBox="0 0 100 200" style={{ width: "100%", height: "100%", display: "block" }}>
      <BodySilhouette />
      {/* Chest — two pec lobes */}
      <ellipse {...m("chest")} cx="40" cy="60" rx="11" ry="11" />
      <ellipse {...m("chest")} cx="60" cy="60" rx="11" ry="11" />
      {/* Front delts */}
      <ellipse {...m("front_delts")} cx="23" cy="46" rx="8" ry="7" />
      <ellipse {...m("front_delts")} cx="77" cy="46" rx="8" ry="7" />
      {/* Side delts — outer shoulder edge */}
      <ellipse {...m("side_delts")} cx="16" cy="53" rx="5" ry="7" />
      <ellipse {...m("side_delts")} cx="84" cy="53" rx="5" ry="7" />
      {/* Biceps */}
      <ellipse {...m("biceps")} cx="18" cy="70" rx="6" ry="11" />
      <ellipse {...m("biceps")} cx="82" cy="70" rx="6" ry="11" />
      {/* Forearms */}
      <ellipse {...m("forearms")} cx="14" cy="93" rx="5" ry="11" />
      <ellipse {...m("forearms")} cx="86" cy="93" rx="5" ry="11" />
      {/* Core / abs */}
      <ellipse {...m("core")} cx="50" cy="83" rx="10" ry="14" />
      {/* Hip flexors */}
      <ellipse {...m("hip_flexors")} cx="50" cy="108" rx="11" ry="7" />
      {/* Quads */}
      <ellipse {...m("quads")} cx="39" cy="140" rx="11" ry="19" />
      <ellipse {...m("quads")} cx="61" cy="140" rx="11" ry="19" />
    </svg>
  );
}

function BodyBack({ p, s }: { p: string[]; s: string[] }) {
  const m = (id: string) => mp(id, p, s);
  return (
    <svg viewBox="0 0 100 200" style={{ width: "100%", height: "100%", display: "block" }}>
      <BodySilhouette />
      {/* Traps — upper back / neck */}
      <ellipse {...m("traps")} cx="50" cy="41" rx="16" ry="10" />
      {/* Rear delts */}
      <ellipse {...m("rear_delts")} cx="22" cy="49" rx="9" ry="6" />
      <ellipse {...m("rear_delts")} cx="78" cy="49" rx="9" ry="6" />
      {/* Lats */}
      <ellipse {...m("back_lats")} cx="28" cy="80" rx="12" ry="23" />
      <ellipse {...m("back_lats")} cx="72" cy="80" rx="12" ry="23" />
      {/* Lower back */}
      <ellipse {...m("lower_back")} cx="50" cy="104" rx="12" ry="8" />
      {/* Triceps */}
      <ellipse {...m("triceps")} cx="17" cy="70" rx="6" ry="11" />
      <ellipse {...m("triceps")} cx="83" cy="70" rx="6" ry="11" />
      {/* Glutes */}
      <ellipse {...m("glutes")} cx="38" cy="118" rx="13" ry="10" />
      <ellipse {...m("glutes")} cx="62" cy="118" rx="13" ry="10" />
      {/* Hamstrings */}
      <ellipse {...m("hamstrings")} cx="39" cy="146" rx="11" ry="18" />
      <ellipse {...m("hamstrings")} cx="61" cy="146" rx="11" ry="18" />
      {/* Calves */}
      <ellipse {...m("calves")} cx="37" cy="173" rx="8" ry="11" />
      <ellipse {...m("calves")} cx="63" cy="173" rx="8" ry="11" />
    </svg>
  );
}

export default function MuscleMap({
  primaryMuscles,
  secondaryMuscles = [],
  size = 140
}: MuscleMapProps) {
  const halfW = Math.round(size / 2);
  const h = halfW * 2; // viewBox is 1:2 (100 × 200)

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    lineHeight: 1
  };

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", color: "var(--text-muted)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ width: halfW, height: h }}>
          <BodyFront p={primaryMuscles} s={secondaryMuscles} />
        </div>
        <span style={labelStyle}>Front</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ width: halfW, height: h }}>
          <BodyBack p={primaryMuscles} s={secondaryMuscles} />
        </div>
        <span style={labelStyle}>Back</span>
      </div>
    </div>
  );
}
