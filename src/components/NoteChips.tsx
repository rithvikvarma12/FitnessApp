import { useState } from "react";
import type { NoteChip } from "../db/types";
import type { ActiveInjury } from "../db/types";

interface NoteChipsProps {
  chips: NoteChip[];
  onChange: (chips: NoteChip[]) => void;
  disabled?: boolean;
  injuries?: ActiveInjury[];
  onUpdateInjuryStatus?: (id: string, response: "still_painful" | "getting_better" | "resolved") => void;
}

type ChipType = NoteChip["type"];

const CHIP_CONFIG = [
  { type: "deload" as ChipType, label: "Deload week", color: "#8b5cf6", bgColor: "rgba(139,92,246,0.15)", hasFollowUp: false },
  { type: "fatigued" as ChipType, label: "Fatigued", color: "#f97316", bgColor: "rgba(249,115,22,0.15)", hasFollowUp: false },
  { type: "traveling" as ChipType, label: "Traveling", color: "#3b82f6", bgColor: "rgba(59,130,246,0.15)", hasFollowUp: true },
  { type: "injury" as ChipType, label: "Injury/Pain", color: "#ef4444", bgColor: "rgba(239,68,68,0.15)", hasFollowUp: true },
  { type: "focus" as ChipType, label: "Focus on...", color: "#10b981", bgColor: "rgba(16,185,129,0.15)", hasFollowUp: true },
  { type: "days_override" as ChipType, label: "Only N days", color: "#3b82f6", bgColor: "rgba(59,130,246,0.15)", hasFollowUp: true },
  { type: "equipment_change" as ChipType, label: "Equipment change", color: "#06b6d4", bgColor: "rgba(6,182,212,0.15)", hasFollowUp: true },
] as const;

const INJURY_AREAS = ["Shoulder", "Knee", "Back", "Elbow", "Wrist", "Hip", "Other"];
const INJURY_SEVERITIES = [
  { value: "mild", label: "Mild (work around)" },
  { value: "moderate", label: "Moderate (avoid loading)" },
  { value: "severe", label: "Severe (skip exercises)" },
];
const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Legs", "Arms", "Core"];
const EQUIPMENT_OPTIONS = ["Full Gym", "Dumbbells Only", "Bodyweight Only", "Home (bands + dumbbells)"];
const EQUIPMENT_DURATIONS = [
  { value: "one_week", label: "Just next week" },
  { value: "until_changed", label: "Until I change it back" },
];

function isChipComplete(chip: NoteChip): boolean {
  switch (chip.type) {
    case "injury": return !!(chip.area && chip.severity);
    case "traveling": return !!(chip.days && chip.equipment);
    case "focus": return !!chip.muscleGroup;
    case "days_override": return chip.days !== undefined;
    case "equipment_change": return !!(chip.equipment && chip.duration);
    default: return true;
  }
}

function PillButton({ label, selected, color, onClick, disabled }: {
  label: string;
  selected: boolean;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 20,
        border: selected
          ? `1.5px solid ${color ?? "var(--accent-blue)"}`
          : "1.5px solid var(--border-glass-hover)",
        background: selected
          ? (color ? `${color}26` : "rgba(59,130,246,0.15)")
          : "transparent",
        color: selected ? (color ?? "var(--accent-blue)") : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function NumberSelector({ value, min, max, color, onChange, disabled }: {
  value: number | undefined;
  min: number;
  max: number;
  color: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {nums.map((n) => (
        <PillButton key={n} label={String(n)} selected={value === n} color={color} onClick={() => onChange(n)} disabled={disabled} />
      ))}
    </div>
  );
}

export default function NoteChips({ chips, onChange, disabled, injuries, onUpdateInjuryStatus }: NoteChipsProps) {
  const [openFollowUp, setOpenFollowUp] = useState<ChipType | null>(null);
  // pendingChip holds unsaved state for chips with follow-ups not yet complete
  const [pendingChip, setPendingChip] = useState<NoteChip | null>(null);
  const [showInjuryPanel, setShowInjuryPanel] = useState(false);

  function getChip(type: ChipType): NoteChip | undefined {
    return chips.find((c) => c.type === type);
  }
  function isActive(type: ChipType): boolean {
    return chips.some((c) => c.type === type);
  }
  function isPending(type: ChipType): boolean {
    return pendingChip?.type === type;
  }
  function removeChip(type: ChipType) {
    onChange(chips.filter((c) => c.type !== type));
    if (openFollowUp === type) { setOpenFollowUp(null); setPendingChip(null); }
  }
  function patchChip(type: ChipType, patch: Partial<NoteChip>) {
    onChange(chips.map((c) => (c.type === type ? { ...c, ...patch } : c)));
  }
  function patchPendingChip(patch: Partial<NoteChip>) {
    if (!pendingChip) return;
    const updated = { ...pendingChip, ...patch };
    setPendingChip(updated);
    if (isChipComplete(updated)) {
      onChange([...chips, updated]);
      setPendingChip(null);
    }
  }
  function discardPending() {
    setPendingChip(null);
    setOpenFollowUp(null);
  }
  function handleChipClick(cfg: typeof CHIP_CONFIG[number]) {
    if (disabled) return;
    if (isActive(cfg.type)) { removeChip(cfg.type); return; }
    if (isPending(cfg.type)) { discardPending(); return; }
    if (pendingChip) setPendingChip(null);
    if (!cfg.hasFollowUp) { onChange([...chips, { type: cfg.type }]); return; }
    setPendingChip({ type: cfg.type });
    setOpenFollowUp(cfg.type);
  }
  function patchFollowUp(patch: Partial<NoteChip>) {
    if (openFollowUp && isPending(openFollowUp)) patchPendingChip(patch);
    else if (openFollowUp) patchChip(openFollowUp, patch);
  }

  const followUpIsPending = openFollowUp ? isPending(openFollowUp) : false;
  const followUpData: NoteChip | undefined = openFollowUp
    ? (followUpIsPending ? (pendingChip ?? undefined) : getChip(openFollowUp))
    : undefined;
  const activeCfg = openFollowUp ? CHIP_CONFIG.find((c) => c.type === openFollowUp) : undefined;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, width: "100%", overflowX: "auto", flexWrap: "nowrap", WebkitOverflowScrolling: "touch", paddingBottom: 4, marginBottom: openFollowUp ? 8 : 0, scrollbarWidth: "none" }}>
        {CHIP_CONFIG.map((cfg) => {
          const active = isActive(cfg.type);
          const pending = isPending(cfg.type);
          let borderStyle = "1.5px solid var(--border-glass-hover)";
          let bgStyle = "transparent";
          let colorStyle = "var(--text-secondary)";

          if (active) {
            borderStyle = `1.5px solid ${cfg.color}`;
            bgStyle = cfg.bgColor;
            colorStyle = cfg.color;
          } else if (pending) {
            borderStyle = `1.5px dashed ${cfg.color}`;
            bgStyle = `${cfg.color}0f`;
            colorStyle = cfg.color;
          }

          return (
            <button
              key={cfg.type}
              type="button"
              disabled={disabled}
              onClick={() => handleChipClick(cfg)}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 20,
                border: borderStyle,
                background: bgStyle,
                color: colorStyle,
                cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {cfg.label}
              {pending && cfg.hasFollowUp && (
                <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}>{"…"}</span>
              )}
            </button>
          );
        })}
        {(injuries && injuries.filter(i => i.status !== "resolved").length > 0) && (
          <button
            type="button"
            onClick={() => { setShowInjuryPanel((v) => !v); setOpenFollowUp(null); setPendingChip(null); }}
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 20,
              border: showInjuryPanel ? "1.5px solid #ef4444" : "1.5px solid var(--border-glass-hover)",
              background: showInjuryPanel ? "rgba(239,68,68,0.15)" : "transparent",
              color: showInjuryPanel ? "#ef4444" : "var(--text-secondary)",
              cursor: "pointer", transition: "all 0.15s",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            Injury Update
          </button>
        )}
      </div>

      {showInjuryPanel && injuries && injuries.filter(i => i.status !== "resolved").length > 0 && (
        <div style={{
          background: "rgba(239,68,68,0.04)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Current Injuries — tap to update
          </div>
          {injuries.filter(i => i.status !== "resolved").map((inj) => (
            <div key={inj.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, textTransform: "capitalize" }}>
                {inj.area}
                <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: 6 }}>
                  ({inj.status === "improving" ? "improving" : inj.severity})
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 16, border: "1.5px solid #f59e0b", background: inj.status === "improving" ? "rgba(245,158,11,0.15)" : "transparent", color: "#f59e0b", cursor: "pointer" }}
                  onClick={() => onUpdateInjuryStatus?.(inj.id, "getting_better")}
                >
                  Improving
                </button>
                <button
                  type="button"
                  style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 16, border: "1.5px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer" }}
                  onClick={() => onUpdateInjuryStatus?.(inj.id, "resolved")}
                >
                  Resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {openFollowUp && followUpData && activeCfg && (
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: followUpIsPending
            ? `1px dashed ${activeCfg.color}80`
            : `1px solid ${activeCfg.color}40`,
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          marginBottom: 8,
          transition: "border-color 0.2s",
        }}>
          {followUpIsPending && (
            <div style={{ fontSize: 10, color: activeCfg.color, fontWeight: 600, marginBottom: 8, opacity: 0.8 }}>
              Complete the form below to add this chip
            </div>
          )}

          {openFollowUp === "traveling" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>How many days can you train?</div>
                <NumberSelector value={followUpData.days} min={1} max={5} color={activeCfg.color} onChange={(n) => patchFollowUp({ days: n })} disabled={disabled} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Equipment available?</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {["Hotel Gym", "Bodyweight Only", "Full Gym"].map((eq) => (
                    <PillButton key={eq} label={eq} selected={followUpData.equipment === eq} color={activeCfg.color} onClick={() => patchFollowUp({ equipment: eq })} disabled={disabled} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {openFollowUp === "injury" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Which area?</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {INJURY_AREAS.map((a) => (
                    <PillButton key={a} label={a} selected={followUpData.area === a} color={activeCfg.color} onClick={() => patchFollowUp({ area: a })} disabled={disabled} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Severity?</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {INJURY_SEVERITIES.map((s) => (
                    <PillButton key={s.value} label={s.label} selected={followUpData.severity === s.value} color={activeCfg.color} onClick={() => patchFollowUp({ severity: s.value })} disabled={disabled} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {openFollowUp === "focus" && (
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Muscle group</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {MUSCLE_GROUPS.map((mg) => (
                  <PillButton key={mg} label={mg} selected={followUpData.muscleGroup === mg} color={activeCfg.color} onClick={() => patchFollowUp({ muscleGroup: mg })} disabled={disabled} />
                ))}
              </div>
            </div>
          )}
          {openFollowUp === "days_override" && (
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Number of days</div>
              <NumberSelector value={followUpData.days} min={1} max={5} color={activeCfg.color} onChange={(n) => patchFollowUp({ days: n })} disabled={disabled} />
            </div>
          )}
          {openFollowUp === "equipment_change" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Equipment</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {EQUIPMENT_OPTIONS.map((eq) => (
                    <PillButton key={eq} label={eq} selected={followUpData.equipment === eq} color={activeCfg.color} onClick={() => patchFollowUp({ equipment: eq })} disabled={disabled} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>For how long?</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {EQUIPMENT_DURATIONS.map((d) => (
                    <PillButton key={d.value} label={d.label} selected={followUpData.duration === d.value} color={activeCfg.color} onClick={() => patchFollowUp({ duration: d.value })} disabled={disabled} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
