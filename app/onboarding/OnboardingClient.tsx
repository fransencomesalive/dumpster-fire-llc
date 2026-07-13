"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import mascotImg from "../scans/dumpsterfireguy.png";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import {
  isGoogleSignInEnabled,
  signInWithGoogle,
  signInWithPasswordSession,
  signOutSupabaseSession,
  syncPublicProfileSession,
} from "@/lib/public-auth/supabase-browser";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import type { PublicProfileOnboardingSection, PublicProfileOnboardingSectionKey } from "@/lib/public-profile/onboarding";
import SiteHeader from "../components/SiteHeader";
import styles from "./onboarding.module.css";
// Loader modal styles — the scan-progress component lives in the dashboard
// module; Card 1's save reuses it 1:1 rather than duplicating the CSS.
import loaderStyles from "../dashboard/dashboard.module.css";

/* ============================================================
   Section view models — mirror lib/public-profile/sections.ts
   (the new ~7-section IA from the generator redesign).
   ============================================================ */

type RemotePreference = "remote_only" | "remote_preferred" | "hybrid_ok" | "onsite_ok";

type IdentitySearchSection = {
  fullName: string;
  preferredName?: string;
  location: string;
  email?: string;
  remotePreference: RemotePreference;
  targetCompensationMin?: number;
  targetCompensationPreferred?: number;
  targetCompensationHourlyMin?: number;
  targetCompensationHourlyPreferred?: number;
  employmentTypes: string[];
  targetIndustries: string[];
  avoidIndustries: string[];
  avoidCompanies: string[];
};

type FitSignalsSection = {
  id?: string;
  goodSignals: string[];
  poorFitSignals: string[];
};

type RoleTrackSectionItem = {
  id: string;
  name: string;
  description: string;
  corePositioning: string;
  outreachAngle: string;
  globalProofRules?: string;
  targetTitles: string[];
  keyResponsibilities: string[];
  requiredExperiencePatterns: string[];
  strongJobSignals: string[];
  weakJobSignals: string[];
  mismatchSignals: string[];
  resumeIds: string[];
};

type RoleTracksSection = { roleTracks: RoleTrackSectionItem[] };

type ParsingQuality = "failed" | "weak" | "complete";

type ResumeUploadSectionItem = {
  id: string;
  name: string;
  fileUrl: string;
  parsedText: string;
  associatedRoleTrackIds: string[];
  strengths: string[];
  gaps: string[];
  useWhen: string[];
  avoidWhen: string[];
  parsingQuality: ParsingQuality;
  parsingIssues: string[];
};

type ResumeUploadsSection = { resumes: ResumeUploadSectionItem[] };

type WorkExampleSectionItem = {
  id: string;
  title: string;
  oneHitter: string;
  link?: string;
  context: string;
};

type WorkExamplesSection = { workExamples: WorkExampleSectionItem[] };

type SkillProficiency = "working" | "strong" | "expert";

type SkillsInventorySectionItem = {
  id: string;
  skillName: string;
  proficiency: SkillProficiency;
  evidence: string[];
  relatedWorkExampleIds: string[];
};

type SkillsInventorySection = { skills: SkillsInventorySectionItem[] };

type VoicePersonalitySection = {
  id?: string;
  q1Value: string;
  q4Opinion: string;
  toneTags: string[];
  avoidTags: string[];
  avoidNote: string;
};

type WritingSampleBucket = "sounds_like_me" | "want_to_sound" | "never_sound";
type WritingChannel = "linkedin" | "email" | "dm" | "social_post" | "other";

type WritingSamplesSectionItem = {
  id: string;
  bucket: WritingSampleBucket;
  channel: WritingChannel;
  text: string;
  tags: string[];
};

type WritingSamplesSection = { writingSamples: WritingSamplesSectionItem[] };

type ProfileQualitySummary = {
  status: "incomplete" | "complete";
  incompleteReasons: string[];
  weakFields: string[];
  weakResponseCount: number;
  lastCheckedAt: string;
};

type SectionReadinessStatus = "not_loaded" | "optional" | "complete" | "incomplete";

type SectionResponse<T> = {
  status: string;
  profileId: string;
  profileStatus: "incomplete" | "complete";
  section: T;
  profileQuality: ProfileQualitySummary;
  // Returned by the resumes PATCH: highlight count per résumé id, for Card 1's
  // "Read — pulled N highlights" note.
  resumeHighlightCounts?: Record<string, number>;
};

// Card 1 résumé intake: scan-and-discard. The PDF is read once via the scan
// endpoint; only the extracted text survives. Notes render as <b>lead</b> tail;
// modelDown marks an Anthropic-side failure, which renders the status-page link.
type ResumeScanState =
  | { status: "idle" }
  | { status: "reading"; fileName: string; fileSize: number }
  | { status: "read"; fileName: string; fileSize: number; text: string; quality: ParsingQuality }
  | { status: "error"; lead: string; tail: string; modelDown?: boolean };

/* ============================================================
   Constants
   ============================================================ */

const notLoadedReadinessLabel = "Not loaded";

// Public tier names — never surface internal plan_name values (premium/tester/etc.) in UI copy.
const PLAN_LABELS: Record<string, string> = { basic: "Good", pro: "Gooder", premium: "Goodest", tester: "Goodest" };
function planLabel(plan: string | null | undefined): string {
  return plan && PLAN_LABELS[plan] ? PLAN_LABELS[plan] : "Good";
}

// Card 1 save pipeline phases, shown in the scan-progress loader modal
// (design-system/components/scan-progress.html, live in DashboardClient):
// save the track, read the résumé + pull highlights, route them to the lane.
const CARD1_SAVE_PHASES = ["Saving", "Reading", "Routing"] as const;


const voiceAnswerWordCap = 120;
const avoidNoteWordCap = 25;
const writingSampleWordCap = 200;

// Tone-tag presets (Phase D / D0 control decisions).
const leanIntoPresets = ["punchy", "warm", "no-fluff", "blunt", "funny", "specific", "casual", "brief"];
const steerClearPresets = ["corporate jargon", "biz-formal", "LinkedIn malarky"];

type WritingBucketConfig = {
  bucket: WritingSampleBucket;
  label: string;
  helper: string;
  placeholder: string;
  required: boolean;
  max: number;
};

// Example text carried over from the approved DS writing-samples card (Randall,
// 2026-07-09: "the example text in each of these is good and i want to keep them
// for production").
const writingBucketConfigs: WritingBucketConfig[] = [
  {
    bucket: "sounds_like_me",
    label: "Sounds like me",
    helper: "Paste something you actually wrote. One is enough; add a second only if it shows a different side of your voice.",
    placeholder: "Hey, quick one. Deploy's green, smoke tests pass, I'm shipping it. If anything looks weird in prod ping me and I'll roll it back, no drama.",
    required: true,
    max: 2,
  },
  {
    bucket: "want_to_sound",
    label: "Want to sound like",
    helper: "Optional. Something in someone else's voice you wish yours read like.",
    placeholder: "Paste a snippet whose voice you'd love yours to read like.",
    required: false,
    max: 1,
  },
  {
    bucket: "never_sound",
    label: "Never sound like",
    helper: "One example of writing you never want to be mistaken for.",
    placeholder: "We are thrilled to leverage our cross-functional synergies to drive holistic, best-in-class outcomes that move the needle…",
    required: true,
    max: 1,
  },
];

const emptyIdentity: IdentitySearchSection = {
  fullName: "",
  location: "",
  remotePreference: "remote_preferred",
  employmentTypes: [],
  targetIndustries: [],
  avoidIndustries: [],
  avoidCompanies: [],
};

const emptyVoice: VoicePersonalitySection = {
  q1Value: "",
  q4Opinion: "",
  toneTags: [],
  avoidTags: [],
  avoidNote: "",
};

const emptyFitSignals: FitSignalsSection = {
  goodSignals: [],
  poorFitSignals: [],
};

/* ============================================================
   Helpers
   ============================================================ */

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function listToText(values: string[] | undefined) {
  return (values ?? []).join(", ");
}

function textToList(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

// Newline-separated variants for prose-length list entries (fit signals, skill
// evidence): sentences keep their commas; each line is one entry (Randall 2026-07-10).
function linesToText(values: string[] | undefined) {
  return (values ?? []).join("\n");
}

function textToLines(value: string) {
  return value.split("\n").map((entry) => entry.trim()).filter(Boolean);
}

// Mirrors the server's tolerant compensation parsing: "150,000", "$150k",
// "72.50" all read correctly. Yearly rounds to dollars; hourly keeps cents.
function compensationNumber(value: string, options: { decimals?: boolean } = {}) {
  const text = value.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!text) return undefined;
  const thousands = text.endsWith("k");
  const numeric = Number(thousands ? text.slice(0, -1) : text);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  const parsed = thousands ? numeric * 1000 : numeric;
  return options.decimals ? Math.round(parsed * 100) / 100 : Math.round(parsed);
}

// Employment-type chips (approved Identity & Search card): tap to toggle.
// "Contract / freelance" is one chip covering both backend values.
const employmentTypeChips: Array<{ label: string; values: string[] }> = [
  { label: "Part-time", values: ["part_time"] },
  { label: "Full-time", values: ["full_time"] },
  { label: "Contract / freelance", values: ["contract", "freelance"] },
];

function countWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// "That's a Word file (resume.docx)." — name the format the way a person would.
function fileKindLabel(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "doc" || ext === "docx") return "Word";
  if (ext === "pages") return "Pages";
  if (ext === "txt") return "text";
  return ext ? `.${ext}` : "non-PDF";
}

function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function emptyRoleTrack(): RoleTrackSectionItem {
  return {
    id: createClientId(),
    name: "",
    description: "",
    corePositioning: "",
    outreachAngle: "",
    globalProofRules: "",
    targetTitles: [],
    keyResponsibilities: [],
    requiredExperiencePatterns: [],
    strongJobSignals: [],
    weakJobSignals: [],
    mismatchSignals: [],
    resumeIds: [],
  };
}

function emptyResume(): ResumeUploadSectionItem {
  return {
    id: createClientId(),
    name: "",
    fileUrl: "",
    parsedText: "",
    associatedRoleTrackIds: [],
    strengths: [],
    gaps: [],
    useWhen: [],
    avoidWhen: [],
    parsingQuality: "weak",
    parsingIssues: [],
  };
}

function emptyWorkExample(): WorkExampleSectionItem {
  return {
    id: createClientId(),
    title: "",
    oneHitter: "",
    link: "",
    context: "",
  };
}

function emptySkill(name = ""): SkillsInventorySectionItem {
  return {
    id: createClientId(),
    skillName: name,
    proficiency: "working",
    evidence: [],
    relatedWorkExampleIds: [],
  };
}

function emptyWritingSample(bucket: WritingSampleBucket): WritingSamplesSectionItem {
  return {
    id: createClientId(),
    bucket,
    channel: "other",
    text: "",
    tags: [],
  };
}

function reasonBelongsToSection(sectionKey: PublicProfileOnboardingSectionKey, reason: string) {
  const value = reason.toLowerCase();
  switch (sectionKey) {
    case "identitySearch":
      return value.includes("full name") || value.includes("location") || value.includes("remote preference") || value.includes("employment");
    case "fitSignals":
      return value.includes("fit signal");
    case "roleTracks":
      // Card 1 owns both the Role Track and its résumé, so résumé blockers roll up here.
      return value.includes("role track") || value.startsWith("resume ") || value.includes("at least one resume");
    case "resumes":
      return value.startsWith("resume ") || value.includes("at least one resume");
    case "workExamples":
      return value.includes("work example");
    case "skills":
      return value.startsWith("skill ") || value.includes("at least one skill");
    case "voicePersonality":
      return value.includes("voice") || value.includes("q1") || value.includes("q4") || value.includes("tone tag") || value.includes("writing sample");
    default:
      return false;
  }
}

function weakFieldBelongsToSection(sectionKey: PublicProfileOnboardingSectionKey, weakField: string) {
  return reasonBelongsToSection(sectionKey, weakField);
}

function proficiencyLabel(proficiency: SkillProficiency) {
  if (proficiency === "expert") return "Expert";
  if (proficiency === "strong") return "Strong";
  return "Working";
}

function readinessLabel(status: SectionReadinessStatus) {
  switch (status) {
    case "complete":
      return "Complete";
    case "incomplete":
      return "Needs work";
    case "optional":
      return "Optional";
    default:
      return notLoadedReadinessLabel;
  }
}

/* ============================================================
   Tone-tag chip group (tap-to-toggle presets + custom chips)
   ============================================================ */

type ChipGroupProps = {
  legend: string;
  presets: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onAddCustom: (value: string) => void;
  onRemoveCustom: (value: string) => void;
  addLabel: string;
  disabled?: boolean;
};

function ChipGroup({ legend, presets, selected, onToggle, onAddCustom, onRemoveCustom, addLabel, disabled }: ChipGroupProps) {
  const [draft, setDraft] = useState("");
  const presetSet = useMemo(() => new Set(presets.map((preset) => preset.toLowerCase())), [presets]);
  const customSelected = selected.filter((value) => !presetSet.has(value.toLowerCase()));

  function commitCustom() {
    const value = draft.trim();
    if (!value) return;
    onAddCustom(value);
    setDraft("");
  }

  return (
    <fieldset className={styles.chipFieldset}>
      <legend className={styles.chipLegend}>{legend}</legend>
      <div className={styles.chipRow}>
        {presets.map((preset) => {
          const on = selected.some((value) => value.toLowerCase() === preset.toLowerCase());
          return (
            <button
              key={preset}
              type="button"
              className={`${styles.chip} ${on ? styles.chipOn : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(preset)}
            >
              {preset}
            </button>
          );
        })}
        {customSelected.map((value) => (
          <span key={value} className={`${styles.chip} ${styles.chipOn} ${styles.chipCustom}`}>
            {value}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove ${value}`}
              disabled={disabled}
              onClick={() => onRemoveCustom(value)}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className={styles.chipAddRow}>
        <input
          className={styles.chipInput}
          value={draft}
          placeholder={addLabel}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCustom();
            }
          }}
        />
        <button type="button" className={styles.secondaryButton} disabled={disabled || !draft.trim()} onClick={commitCustom}>
          Add
        </button>
      </div>
    </fieldset>
  );
}

/* ============================================================
   Type-ahead catalogue picker (single + multi modes)
   Consumes /api/catalogues/{skills,industries,locations}.
   ============================================================ */

type CatalogueKind = "skills" | "industries" | "locations";
type CatalogueResult = { id: string; label: string };
type CatalogueResponse = { results: CatalogueResult[] };

type CataloguePickerProps = {
  kind: CatalogueKind;
  accessToken: string;
  label: string;
  placeholder: string;
  // Italic pre-loaded placeholder — same treatment as Card 1's track-name field.
  italicPlaceholder?: boolean;
  disabled?: boolean;
} & (
  | { mode: "single"; value: string; onSelect: (label: string) => void }
  | { mode: "multi"; values: string[]; onAdd: (label: string) => void; onRemove: (label: string) => void }
);

function CataloguePicker(props: CataloguePickerProps) {
  const { kind, accessToken, label, placeholder, italicPlaceholder, disabled } = props;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogueResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || !accessToken) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const response = await requestPublicProfileApi<CatalogueResponse>(
          `/api/catalogues/${kind}?q=${encodeURIComponent(trimmed)}&limit=8`,
          { method: "GET", accessToken },
        );
        if (!cancelled) {
          const nextResults = response.results ?? [];
          setResults(nextResults);
          // Highlight the first MATCH by default (the add-row above it is
          // discoverable but Enter should still pick the top suggestion).
          const hasAddRow = !nextResults.some((result) => result.label.toLowerCase() === trimmed.toLowerCase());
          setActiveIndex(hasAddRow && nextResults.length > 0 ? 1 : 0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, kind, accessToken]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const trimmedQuery = query.trim();
  const hasExactMatch = results.some((result) => result.label.toLowerCase() === trimmedQuery.toLowerCase());
  // Custom add sits at the TOP of the menu in its own section (approved pickers
  // card, 2026-07-09): users must see that adding is possible without scrolling.
  const customOption = trimmedQuery && !hasExactMatch
    ? { key: `custom-${trimmedQuery}`, label: trimmedQuery, custom: true }
    : undefined;
  const options: Array<{ key: string; label: string; custom: boolean }> = [
    ...(customOption ? [customOption] : []),
    ...results.map((result) => ({ key: result.id, label: result.label, custom: false })),
  ];

  function choose(value: string) {
    if (props.mode === "single") {
      props.onSelect(value);
      setQuery("");
    } else {
      if (!props.values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
        props.onAdd(value);
      }
      setQuery("");
    }
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.label);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.pickerField} ref={wrapRef}>
      <span className={styles.pickerLabel}>{label}</span>
      {props.mode === "single" && props.value ? (
        <div className={styles.pickerChips}>
          <span className={`${styles.chip} ${styles.chipOn}`}>
            {props.value}
            <button type="button" className={styles.chipRemove} aria-label="Clear" disabled={disabled} onClick={() => props.onSelect("")}>
              ✕
            </button>
          </span>
        </div>
      ) : null}
      {props.mode === "multi" && props.values.length > 0 ? (
        <div className={styles.pickerChips}>
          {props.values.map((value) => (
            <span key={value} className={`${styles.chip} ${styles.chipOn}`}>
              {value}
              <button type="button" className={styles.chipRemove} aria-label={`Remove ${value}`} disabled={disabled} onClick={() => props.onRemove(value)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.pickerInputWrap}>
        <input
          className={`${styles.pickerInput} ${italicPlaceholder ? styles.pickerInputItalic : ""}`}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
        />
        {open && trimmedQuery ? (
          <ul className={styles.pickerDropdown} role="listbox" id={listboxId}>
            {loading && options.length === 0 ? (
              <li className={styles.pickerEmpty}>Searching…</li>
            ) : options.length === 0 ? (
              <li className={styles.pickerEmpty}>No matches.</li>
            ) : (
              options.map((option, index) => (
                <li key={option.key} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={`${styles.pickerOption} ${option.custom ? styles.pickerOptionAdd : ""} ${index === activeIndex ? styles.pickerOptionActive : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.label)}
                  >
                    {option.custom ? <>+ Add &ldquo;<b>{option.label}</b>&rdquo;</> : option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* ============================================================
   Token-list input — the shared free-text chip primitive
   (onboarding-pickers DS card gesture contract, Randall 2026-07-10):
   Enter, comma, and blur all commit; a typed or pasted comma splits into one
   chip per segment; × removes; dedupe is case-insensitive; chips sit ABOVE
   the input. Callers pass the skin (Card 1 titleTokens vs picker chips).
   ============================================================ */

function TokenListInput({
  values,
  onChange,
  placeholder,
  disabled,
  inputId,
  removeGlyph = "×",
  classes,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  inputId?: string;
  removeGlyph?: string;
  classes: { chips: string; chip: string; remove: string; input: string };
}) {
  const [draft, setDraft] = useState("");

  function addValues(rawValues: string[]) {
    const additions: string[] = [];
    for (const raw of rawValues) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (values.some((value) => value.toLowerCase() === lower)) continue;
      if (additions.some((value) => value.toLowerCase() === lower)) continue;
      additions.push(trimmed);
    }
    if (additions.length > 0) onChange([...values, ...additions]);
  }

  function commit() {
    const value = draft;
    setDraft("");
    addValues(value.split(","));
  }

  // A typed or pasted comma commits the completed segments immediately; whatever
  // follows the last comma stays in the input as the in-progress value.
  function handleChange(value: string) {
    if (!value.includes(",")) {
      setDraft(value);
      return;
    }
    const lastComma = value.lastIndexOf(",");
    addValues(value.slice(0, lastComma).split(","));
    setDraft(value.slice(lastComma + 1).replace(/^\s+/, ""));
  }

  return (
    <>
      {values.length > 0 ? (
        <div className={classes.chips}>
          {values.map((value) => (
            <span key={value} className={classes.chip}>
              {value}
              <button
                type="button"
                className={classes.remove}
                aria-label={`Remove ${value}`}
                disabled={disabled}
                onClick={() => onChange(values.filter((entry) => entry !== value))}
              >
                {removeGlyph}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        id={inputId}
        className={classes.input}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </>
  );
}

/* ============================================================
   Main client
   ============================================================ */

export default function OnboardingClient({
  sections,
}: {
  sections: PublicProfileOnboardingSection[];
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [planName, setPlanName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);
  // Plan / Billing open lightweight popups; the full management flows land later. The
  // access-code redeem field folds into the Billing popup (Randall, 2026-07-12).
  const [accountPopup, setAccountPopup] = useState<null | "plan" | "billing">(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [identity, setIdentity] = useState<IdentitySearchSection>(emptyIdentity);
  const [fitSignals, setFitSignals] = useState<FitSignalsSection>(emptyFitSignals);
  const [roleTracks, setRoleTracks] = useState<RoleTrackSectionItem[]>([]);
  const [resumes, setResumes] = useState<ResumeUploadSectionItem[]>([]);
  const [workExamples, setWorkExamples] = useState<WorkExampleSectionItem[]>([]);
  const [skills, setSkills] = useState<SkillsInventorySectionItem[]>([]);
  const [voice, setVoice] = useState<VoicePersonalitySection>(emptyVoice);
  const [writingSamples, setWritingSamples] = useState<WritingSamplesSectionItem[]>([]);

  // Card 1 (Role Track + Résumé) — onboarding-resume-upload DS card.
  const [activeTrackId, setActiveTrackId] = useState("");
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState("");
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [resumeScan, setResumeScan] = useState<ResumeScanState>({ status: "idle" });
  const [pastedResumeText, setPastedResumeText] = useState("");
  // Job-title chips (Randall, 2026-07-10). Saved tracks persist edits straight away;
  // a not-yet-saved track (first run / creating) collects titles in a local draft list.
  const [draftTitles, setDraftTitles] = useState<string[]>([]);
  const [card1Note, setCard1Note] = useState<{ count?: number; trackName: string; fileSize?: number } | null>(null);
  // Loader modal for the Card 1 save (scan-progress component). Closes on both
  // success (card flips to its saved state) and failure (message reports it).
  const [saveProgress, setSaveProgress] = useState<{ status: "idle" } | { status: "running"; phase: number }>({ status: "idle" });
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const trackSelectRef = useRef<HTMLDivElement>(null);

  // Card-interior spec (Randall, 2026-07-10). Saved entries (Work Examples, Skills)
  // collapse to title rows; one expands at a time. A brand-new entry lives in a
  // separate draft slot — NOT in the persisted array — until its Save, because the
  // server reassigns a fresh id to any unowned entry (resolveOwnedItemId) and a
  // whole-array PATCH would otherwise persist every half-filled new entry at once.
  const [openWorkExampleId, setOpenWorkExampleId] = useState<string | null>(null);
  const [draftWorkExample, setDraftWorkExample] = useState<WorkExampleSectionItem | null>(null);
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);
  const [draftSkill, setDraftSkill] = useState<SkillsInventorySectionItem | null>(null);
  // Per-field edit toggles, namespaced: `we.<id>.<field>`, `sk.<id>.<field>`,
  // `voice.q1|q4|avoidNote`, `ws.<id>`, `fit.good|poor`. A key present = that field
  // is showing its input; absent = its saved text + pencil (or the input if empty).
  const [editingFields, setEditingFields] = useState<Set<string>>(() => new Set());

  // Comma-list inputs keep the user's raw text while typing. Parsing trims each
  // entry, and round-tripping the trimmed value back into the input used to eat
  // the space after every word (Randall, 2026-07-08 — "freelancefulltime").
  const [listFieldDrafts, setListFieldDrafts] = useState<Record<string, string>>({});

  // Unsaved edits persist in localStorage (per profile) so leaving the tab/page
  // never silently discards typed input, and reloads never ghost-replace what the
  // user typed with server values (Randall, 2026-07-08). Drafts hydrate after the
  // server load, win until saved, and clear on reset/sign-out. Known trade-off:
  // a stale local draft can shadow newer edits made on another device until saved.
  const draftsHydratedRef = useRef(false);
  const draftStorageKeyRef = useRef("");

  const [profileStatus, setProfileStatus] = useState<"incomplete" | "complete">("incomplete");
  const [profileQuality, setProfileQuality] = useState<ProfileQualitySummary | null>(null);
  const [message, setMessage] = useState("Sign in to start your profile.");
  const [busy, setBusy] = useState(false);

  const requiredSections = useMemo(() => sections.filter((section) => section.required), [sections]);

  const applyProfileQuality = useCallback((summary: ProfileQualitySummary) => {
    setProfileQuality(summary);
    setProfileStatus(summary.status);
  }, []);

  const readinessBySection = useMemo(() => {
    return new Map(sections.map((section) => {
      const blockers = profileQuality?.incompleteReasons.filter((reason) => reasonBelongsToSection(section.key, reason)) ?? [];
      const weakFields = profileQuality?.weakFields.filter((weakField) => weakFieldBelongsToSection(section.key, weakField)) ?? [];
      const status: SectionReadinessStatus = !profileQuality
        ? "not_loaded"
        : !section.required
          ? "optional"
          : blockers.length === 0 && weakFields.length === 0
            ? "complete"
            : "incomplete";
      return [section.key, { status, blockers, weakFields }] as const;
    }));
  }, [profileQuality, sections]);

  const completeRequiredSections = useMemo(() => {
    if (!profileQuality) return 0;
    return requiredSections.filter((section) => readinessBySection.get(section.key)?.status === "complete").length;
  }, [profileQuality, readinessBySection, requiredSections]);

  const loadProfile = useCallback(async (token: string) => {
    const bootstrap = await requestPublicProfileApi<{
      profileStatus: "incomplete" | "complete";
      profileQuality: ProfileQualitySummary;
    }>("/api/public-profile/bootstrap", { method: "POST", accessToken: token });

    const get = <T,>(path: string) => requestPublicProfileApi<SectionResponse<T>>(path, { method: "GET", accessToken: token });

    const [
      identityResponse,
      fitSignalsResponse,
      roleTracksResponse,
      resumeResponse,
      workExamplesResponse,
      skillsResponse,
      voiceResponse,
      writingSamplesResponse,
    ] = await Promise.all([
      get<IdentitySearchSection>("/api/public-profile/identity-search"),
      get<FitSignalsSection>("/api/public-profile/fit-signals"),
      get<RoleTracksSection>("/api/public-profile/role-tracks"),
      get<ResumeUploadsSection>("/api/public-profile/resumes"),
      get<WorkExamplesSection>("/api/public-profile/work-examples"),
      get<SkillsInventorySection>("/api/public-profile/skills"),
      get<VoicePersonalitySection>("/api/public-profile/voice-personality"),
      get<WritingSamplesSection>("/api/public-profile/writing-samples"),
    ]);

    setIdentity(identityResponse.section);
    setFitSignals(fitSignalsResponse.section);
    setRoleTracks(roleTracksResponse.section.roleTracks);
    setResumes(resumeResponse.section.resumes);
    setWorkExamples(workExamplesResponse.section.workExamples);
    setSkills(skillsResponse.section.skills);
    setVoice(voiceResponse.section);
    setWritingSamples(writingSamplesResponse.section.writingSamples);
    applyProfileQuality(identityResponse.profileQuality ?? bootstrap.profileQuality);

    // Local drafts hydrate OVER the server values — typed-but-unsaved input outranks
    // whatever the server (or a seed) holds until the user saves or resets.
    draftStorageKeyRef.current = `df-onboarding-drafts:${identityResponse.profileId}`;
    try {
      const raw = window.localStorage.getItem(draftStorageKeyRef.current);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        if (draft?.v === 1) {
          if (draft.identity) setIdentity(draft.identity as IdentitySearchSection);
          if (draft.fitSignals) setFitSignals(draft.fitSignals as FitSignalsSection);
          if (draft.workExamples) setWorkExamples(draft.workExamples as WorkExampleSectionItem[]);
          if (draft.skills) setSkills(draft.skills as SkillsInventorySectionItem[]);
          if (draft.voice) setVoice(draft.voice as VoicePersonalitySection);
          if (draft.writingSamples) setWritingSamples(draft.writingSamples as WritingSamplesSectionItem[]);
          if (typeof draft.newTrackName === "string") setNewTrackName(draft.newTrackName);
          if (typeof draft.pastedResumeText === "string") setPastedResumeText(draft.pastedResumeText);
          if (draft.listFieldDrafts) setListFieldDrafts(draft.listFieldDrafts as Record<string, string>);
        }
      }
    } catch {
      // Unreadable draft — server values stand.
    }
    draftsHydratedRef.current = true;

    // Account identity for the account panel (email + plan chip). Never block the
    // profile load on this — the panel degrades to email-only if it fails.
    const account = await requestPublicProfileApi<{ email: string | null; planName: string | null }>(
      "/api/account/plan",
      { method: "GET", accessToken: token },
    ).catch(() => null);
    if (account) {
      setAccountEmail(account.email ?? "");
      setPlanName(account.planName);
      // Plan gate: a signed-in user with no active plan hasn't completed the
      // plan step yet — send them there (an access code unlocks onboarding).
      if (!account.planName) {
        router.replace("/plan");
        return;
      }
    }
    setMessage("Profile sections loaded.");
  }, [applyProfileQuality, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
      if (!token || cancelled) return;
      setAccessToken(token);
      setBusy(true);
      loadProfile(token)
      .catch((error) => {
          clearPublicProfileAccessToken();
          setAccessToken("");
          setMessage(error instanceof Error ? error.message : "Stored session could not be restored.");
        })
        .finally(() => setBusy(false));
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  // Onboarding is also the profile edit surface. Only auto-advance to the dashboard when the
  // profile TRANSITIONS to complete during this session (first-run completion handoff). A user
  // who arrives already-complete is editing, so they stay here.
  const initialCompletionRecorded = useRef(false);
  const arrivedComplete = useRef(false);
  useEffect(() => {
    if (!profileQuality) return;
    if (!initialCompletionRecorded.current) {
      initialCompletionRecorded.current = true;
      arrivedComplete.current = profileQuality.status === "complete";
      return;
    }
    if (!arrivedComplete.current && profileQuality.status === "complete") {
      router.replace("/dashboard");
    }
  }, [profileQuality, router]);

  // Card 1: default the active Role Track to the first saved one.
  useEffect(() => {
    if (roleTracks.length === 0) {
      setActiveTrackId("");
      return;
    }
    if (!roleTracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(roleTracks[0].id);
    }
  }, [roleTracks, activeTrackId]);

  // Card 1: close the Role Track dropdown on click-away (same pattern as CataloguePicker).
  useEffect(() => {
    if (!trackMenuOpen) return;
    function onClickAway(event: MouseEvent) {
      if (trackSelectRef.current && !trackSelectRef.current.contains(event.target as Node)) {
        setTrackMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [trackMenuOpen]);

  // Persist edits to the local draft store (debounced) once drafts have hydrated.
  useEffect(() => {
    if (!draftsHydratedRef.current || !draftStorageKeyRef.current) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftStorageKeyRef.current, JSON.stringify({
          v: 1,
          identity,
          fitSignals,
          workExamples,
          skills,
          voice,
          writingSamples,
          newTrackName,
          pastedResumeText,
          listFieldDrafts,
        }));
      } catch {
        // Storage unavailable/full — edits simply don't persist across reloads.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [identity, fitSignals, workExamples, skills, voice, writingSamples, newTrackName, pastedResumeText, listFieldDrafts]);

  async function signIn() {
    setBusy(true);
    setMessage("Signing in…");
    try {
      const token = await signInWithPasswordSession(email, password);
      setAccessToken(token);
      await loadProfile(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    setMessage("Sending you to Google\u2026");
    try {
      await signInWithGoogle("/plan");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign in failed.");
      setBusy(false);
    }
  }

  async function redeemInviteCode() {
    if (!accessToken || !inviteCode.trim()) return;
    setRedeemingCode(true);
    try {
      const result = await requestPublicProfileApi<{ status: string; planName: string }>(
        "/api/account/redeem-code",
        { method: "POST", accessToken, body: { code: inviteCode } },
      );
      setInviteCode("");
      setPlanName(result.planName);
      setMessage(`Access code accepted: the ${planLabel(result.planName)} plan is active.`);
    } catch (error) {
      const body = (error as { body?: { error?: string } }).body;
      setMessage(body?.error || "That code did not work.");
    } finally {
      setRedeemingCode(false);
    }
  }

  function clearLocalDrafts() {
    if (draftStorageKeyRef.current) {
      try {
        window.localStorage.removeItem(draftStorageKeyRef.current);
      } catch {
        // noop — worst case a stale draft lingers for this profile id
      }
    }
    setListFieldDrafts({});
    draftsHydratedRef.current = false;
  }

  function signOut() {
    clearLocalDrafts();
    void signOutSupabaseSession();
    clearPublicProfileAccessToken();
    setAccessToken("");
    setIdentity(emptyIdentity);
    setFitSignals(emptyFitSignals);
    setRoleTracks([]);
    setResumes([]);
    setWorkExamples([]);
    setSkills([]);
    setVoice(emptyVoice);
    setWritingSamples([]);
    setProfileStatus("incomplete");
    setProfileQuality(null);
    setAccountEmail("");
    setPlanName(null);
    setReviewOpen(false);
    setMessage("Signed out.");
  }

  async function saveSection<T>(label: string, path: string, body: unknown, onResult: (section: T, quality: ProfileQualitySummary) => void) {
    if (!accessToken) return;
    setBusy(true);
    setMessage(`Saving ${label}…`);
    try {
      const response = await requestPublicProfileApi<SectionResponse<T>>(path, { method: "PATCH", accessToken, body });
      onResult(response.section, response.profileQuality);
      applyProfileQuality(response.profileQuality);
      // The review panel surfaces only when a save leaves the profile incomplete
      // (design-pass note #8). A clean save clears it.
      setReviewOpen(response.profileQuality.status === "incomplete");
      setMessage(`${label} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  const saveIdentity = () =>
    saveSection<IdentitySearchSection>("Identity & Search", "/api/public-profile/identity-search", identity, (section) => setIdentity(section));
  const saveFitSignals = () =>
    saveSection<FitSignalsSection>("Fit Signals", "/api/public-profile/fit-signals", fitSignals, (section) => {
      setFitSignals(section);
      closeFields("fit."); // populated fields collapse back to saved-text/pencil
    });
  // --- Card 1: Role Track + Résumé (onboarding-resume-upload DS card) ---

  const firstRun = roleTracks.length === 0;
  const activeTrack = roleTracks.find((track) => track.id === activeTrackId);
  const attachedResume = activeTrack
    ? resumes.find((resume) => resume.associatedRoleTrackIds.includes(activeTrack.id))
    : undefined;
  // The rest of onboarding unlocks once one Role Track is saved with a résumé
  // that has text (scanned or pasted).
  const card1Complete = roleTracks.some((track) =>
    track.name.trim().length > 0 &&
    track.resumeIds.some((resumeId) => resumes.some((resume) => resume.id === resumeId && resume.parsedText.trim().length > 0)));

  // Scan the dropped/chosen PDF into text. The file itself is never stored.
  async function scanResumePdf(file: File) {
    if (!accessToken) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setResumeScan({
        status: "error",
        lead: `That's a ${fileKindLabel(file.name)} file (${file.name}).`,
        tail: "We only read PDFs — export or “Save as” PDF, or paste your text.",
      });
      return;
    }
    setResumeScan({ status: "reading", fileName: file.name, fileSize: file.size });
    setMessage("Reading your PDF…");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/public-profile/resumes/scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = await response.json().catch(() => null) as
        | { status?: string; parsingQuality?: ParsingQuality; extractedText?: string; error?: string; detail?: string }
        | null;
      if (!response.ok) {
        const detail = data?.detail ?? "We couldn't read that PDF.";
        const stop = detail.indexOf(". ");
        setResumeScan({
          status: "error",
          lead: stop === -1 ? detail : detail.slice(0, stop + 1),
          tail: stop === -1 ? "" : detail.slice(stop + 2),
        });
        setMessage("Résumé scan failed.");
        return;
      }
      if (data?.status === "model_unavailable") {
        setResumeScan({
          status: "error",
          modelDown: true,
          lead: "Anthropic — the AI that reads your PDF — is having trouble right now.",
          tail: "",
        });
        setMessage("Résumé scan unavailable.");
        return;
      }
      if (data?.status !== "scanned" || !data.extractedText?.trim() || data.parsingQuality === "failed") {
        setResumeScan({
          status: "error",
          lead: "We couldn't pull any text from this PDF.",
          tail: "Looks like scanned images. Paste your résumé text so nothing gets missed.",
        });
        setMessage("Résumé scan failed.");
        return;
      }
      const read: ResumeScanState = {
        status: "read",
        fileName: file.name,
        fileSize: file.size,
        text: data.extractedText,
        quality: data.parsingQuality ?? "complete",
      };
      setResumeScan(read);
      setMessage("Résumé read.");
      // Replacing the résumé on an already-saved track persists straight away —
      // the saved card has no separate Save button (DS card state 2).
      if (!firstRun && !creatingTrack && attachedResume) {
        await saveCard1(read);
      }
    } catch {
      setResumeScan({
        status: "error",
        lead: "We couldn't read this PDF right now.",
        tail: "Paste the text — it feeds highlights exactly the same way.",
      });
      setMessage("Résumé scan failed.");
    }
  }

  // Persist Card 1: the Role Track, its résumé (exactly one per track), and the
  // track→résumé link the completion check requires. Three sequential PATCHes
  // because new items get server ids and attachments only validate against saved rows.
  async function saveCard1(scanOverride?: ResumeScanState) {
    if (!accessToken) return;
    const scan = scanOverride ?? resumeScan;
    const isNewTrack = firstRun || creatingTrack;
    const trackName = isNewTrack ? newTrackName.trim() : (activeTrack?.name.trim() ?? "");
    const resumeText = scan.status === "read" ? scan.text : pastedResumeText.trim();
    if (!trackName || !resumeText) return;
    setBusy(true);
    setMessage("Saving Role Track & Résumé…");
    setSaveProgress({ status: "running", phase: 0 });
    try {
      // 1. Save the track. A new track duplicates the active track's details —
      // duplicate-and-edit — so only what differs for this lane needs adjusting.
      let tracksBody = roleTracks;
      let trackIndex = roleTracks.findIndex((track) => track.id === activeTrackId);
      if (isNewTrack) {
        const source = creatingTrack && activeTrack ? activeTrack : undefined;
        const newTrack: RoleTrackSectionItem = source
          ? { ...source, id: createClientId(), name: trackName, resumeIds: [], targetTitles: draftTitles }
          : { ...emptyRoleTrack(), name: trackName, targetTitles: draftTitles };
        tracksBody = [...roleTracks, newTrack];
        trackIndex = tracksBody.length - 1;
      }
      const trackResponse = await requestPublicProfileApi<SectionResponse<RoleTracksSection>>(
        "/api/public-profile/role-tracks",
        { method: "PATCH", accessToken, body: { roleTracks: tracksBody } },
      );
      const savedTracks = trackResponse.section.roleTracks;
      const savedTrack = savedTracks[trackIndex];
      if (!savedTrack) throw new Error("Role Track save came back empty.");
      setSaveProgress({ status: "running", phase: 1 });

      // 2. Save the résumé attached to exactly this track.
      const existingResume = resumes.find((resume) => resume.associatedRoleTrackIds.includes(savedTrack.id));
      const resumeItem: ResumeUploadSectionItem = {
        ...(existingResume ?? emptyResume()),
        name: scan.status === "read" ? scan.fileName : (existingResume?.name || `${savedTrack.name} résumé`),
        parsedText: resumeText,
        parsingQuality: scan.status === "read" ? scan.quality : "complete",
        associatedRoleTrackIds: [savedTrack.id],
      };
      const resumesBody = existingResume
        ? resumes.map((resume) => (resume.id === existingResume.id ? resumeItem : resume))
        : [...resumes, resumeItem];
      const resumeIndex = existingResume
        ? resumes.findIndex((resume) => resume.id === existingResume.id)
        : resumesBody.length - 1;
      const resumeResponse = await requestPublicProfileApi<SectionResponse<ResumeUploadsSection>>(
        "/api/public-profile/resumes",
        { method: "PATCH", accessToken, body: { resumes: resumesBody } },
      );
      const savedResumes = resumeResponse.section.resumes;
      const savedResume = savedResumes[resumeIndex];
      if (!savedResume) throw new Error("Résumé save came back empty.");
      setSaveProgress({ status: "running", phase: 2 });

      // 3. Point the track at its résumé.
      const linkedTracks = savedTracks.map((track) =>
        track.id === savedTrack.id ? { ...track, resumeIds: [savedResume.id] } : track);
      const linkResponse = await requestPublicProfileApi<SectionResponse<RoleTracksSection>>(
        "/api/public-profile/role-tracks",
        { method: "PATCH", accessToken, body: { roleTracks: linkedTracks } },
      );

      setRoleTracks(linkResponse.section.roleTracks);
      setResumes(savedResumes);
      setActiveTrackId(linkResponse.section.roleTracks[trackIndex]?.id ?? savedTrack.id);
      setCard1Note({
        count: resumeResponse.resumeHighlightCounts?.[savedResume.id],
        trackName: savedTrack.name,
        fileSize: scan.status === "read" ? scan.fileSize : undefined,
      });
      applyProfileQuality(linkResponse.profileQuality);
      setReviewOpen(linkResponse.profileQuality.status === "incomplete");
      setCreatingTrack(false);
      setNewTrackName("");
      setTrackMenuOpen(false);
      setResumeScan({ status: "idle" });
      setPastedResumeText("");
      setDraftTitles([]);
      setMessage("Role Track & Résumé saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaveProgress({ status: "idle" });
      setBusy(false);
    }
  }

  // --- Card 1 job-title chips: type a title, Enter (or blur) lands it as a chip. ---

  const titleChips = firstRun || creatingTrack ? draftTitles : (activeTrack?.targetTitles ?? []);

  // Persist a saved track's titles straight away — like the résumé replace, the
  // saved card has no separate Save button.
  async function saveTrackTitles(next: string[]) {
    if (!accessToken || !activeTrack) return;
    const previous = roleTracks;
    setRoleTracks(roleTracks.map((track) =>
      track.id === activeTrack.id ? { ...track, targetTitles: next } : track));
    try {
      const response = await requestPublicProfileApi<SectionResponse<RoleTracksSection>>(
        "/api/public-profile/role-tracks",
        {
          method: "PATCH",
          accessToken,
          body: { roleTracks: previous.map((track) =>
            track.id === activeTrack.id ? { ...track, targetTitles: next } : track) },
        },
      );
      setRoleTracks(response.section.roleTracks);
      applyProfileQuality(response.profileQuality);
    } catch (error) {
      setRoleTracks(previous);
      setMessage(error instanceof Error ? error.message : "Job title save failed.");
    }
  }

  // Title edits route through the shared TokenListInput: draft list for a track that
  // doesn't exist yet, immediate persist for a saved track.
  function handleTitleChipsChange(next: string[]) {
    if (firstRun || creatingTrack) {
      setDraftTitles(next);
    } else {
      void saveTrackTitles(next);
    }
  }

  // Testing control: factory-reset this account's profile (server re-checks the
  // allowlist), then bootstrap + reload so the page returns to first run.
  /* --- Card-interior field editing + entry saves (Randall, 2026-07-10) --- */

  const isEditing = (key: string) => editingFields.has(key);
  function openField(key: string) {
    setEditingFields((current) => new Set(current).add(key));
  }
  function closeField(key: string) {
    setEditingFields((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }
  function closeFields(...prefixes: string[]) {
    setEditingFields((current) => new Set([...current].filter((key) => !prefixes.some((prefix) => key.startsWith(prefix)))));
  }

  // Whole-array PATCH shared by per-field edits, new-draft saves, and removes
  // (Card 1 titles precedent). Returns the response so callers collapse the right
  // piece only when the save actually lands.
  async function patchSection<T>(label: string, path: string, body: unknown): Promise<SectionResponse<T> | null> {
    if (!accessToken) return null;
    setBusy(true);
    setMessage(`Saving ${label}…`);
    try {
      const response = await requestPublicProfileApi<SectionResponse<T>>(path, { method: "PATCH", accessToken, body });
      applyProfileQuality(response.profileQuality);
      setReviewOpen(response.profileQuality.status === "incomplete");
      setMessage(`${label} saved.`);
      return response;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function commitWorkExamples(nextExamples: WorkExampleSectionItem[], onSaved?: () => void) {
    const response = await patchSection<WorkExamplesSection>("Work Examples", "/api/public-profile/work-examples", { workExamples: nextExamples });
    if (!response) return;
    setWorkExamples(response.section.workExamples);
    onSaved?.();
  }

  async function commitSkills(nextSkills: SkillsInventorySectionItem[], onSaved?: () => void) {
    const response = await patchSection<SkillsInventorySection>("Skills", "/api/public-profile/skills", { skills: nextSkills });
    if (!response) return;
    setSkills(response.section.skills);
    onSaved?.();
  }

  const toggleWorkExampleOpen = (id: string) => setOpenWorkExampleId((current) => (current === id ? null : id));
  const toggleSkillOpen = (id: string) => setOpenSkillId((current) => (current === id ? null : id));

  function saveDraftWorkExample() {
    if (!draftWorkExample) return;
    void commitWorkExamples([...workExamples, draftWorkExample], () => setDraftWorkExample(null));
  }
  function removeWorkExample(id: string) {
    void commitWorkExamples(workExamples.filter((item) => item.id !== id), () => {
      if (openWorkExampleId === id) setOpenWorkExampleId(null);
      closeFields(`we.${id}.`);
    });
  }
  function saveDraftSkill() {
    if (!draftSkill) return;
    void commitSkills([...skills, draftSkill], () => setDraftSkill(null));
  }
  function removeSkill(id: string) {
    void commitSkills(skills.filter((item) => item.id !== id), () => {
      if (openSkillId === id) setOpenSkillId(null);
      closeFields(`sk.${id}.`);
    });
  }

  // A saved-entry field with the presentation read/edit toggle (card-interior spec):
  // saved value + mustard pencil ↔ input + small per-field Save (whole-array PATCH).
  // For list/checkbox fields the caller passes readNode + editNode instead.
  function savedEntryField(opts: {
    fieldKey: string;
    label: string;
    value?: string;
    onChange?: (value: string) => void;
    onSave: () => void;
    isLink?: boolean;
    multiline?: boolean;
    readNode?: React.ReactNode;
    editNode?: React.ReactNode;
  }) {
    const editing = isEditing(opts.fieldKey);
    const trimmed = (opts.value ?? "").trim();
    let read: React.ReactNode;
    if (opts.readNode !== undefined) {
      read = opts.readNode;
    } else if (!trimmed) {
      read = <p className={`${styles.savedText} ${styles.faint}`}>Not set yet</p>;
    } else if (opts.isLink) {
      read = <p className={styles.savedText}><a href={opts.value} target="_blank" rel="noreferrer">{opts.value}</a></p>;
    } else {
      read = <p className={styles.savedText}>{opts.value}</p>;
    }
    return (
      <div className={styles.entryField}>
        <div className={styles.entryFieldHead}>
          <span className={styles.entryFieldLabel}>{opts.label}</span>
          {editing ? null : editPencilButton(opts.fieldKey, `Edit ${opts.label.toLowerCase()}`)}
        </div>
        {editing ? (
          <>
            {opts.editNode ?? (
              opts.multiline ? (
                <textarea className={styles.entryTa} value={opts.value ?? ""} onChange={(event) => opts.onChange?.(event.target.value)} />
              ) : (
                <input className={styles.entryInput} value={opts.value ?? ""} onChange={(event) => opts.onChange?.(event.target.value)} />
              )
            )}
            <button type="button" className={styles.saveSmall} disabled={busy} onClick={opts.onSave}>Save</button>
          </>
        ) : (
          read
        )}
      </div>
    );
  }

  // Voice & Personality persists to two endpoints: voice-personality + writing-samples.
  async function saveVoiceAndPersonality() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Saving Voice & Personality…");
    try {
      await requestPublicProfileApi<SectionResponse<VoicePersonalitySection>>("/api/public-profile/voice-personality", {
        method: "PATCH",
        accessToken,
        body: voice,
      });
      const writingResponse = await requestPublicProfileApi<SectionResponse<WritingSamplesSection>>("/api/public-profile/writing-samples", {
        method: "PATCH",
        accessToken,
        body: { writingSamples },
      });
      setWritingSamples(writingResponse.section.writingSamples);
      applyProfileQuality(writingResponse.profileQuality);
      setReviewOpen(writingResponse.profileQuality.status === "incomplete");
      // Populated prose fields collapse back to their saved-text/pencil read state.
      closeFields("voice.", "ws.");
      setMessage("Voice & Personality saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  /* --- per-item state updates --- */

  // value/onChange pair for a comma-separated list input: shows the raw draft text
  // (so spaces survive typing) while feeding the parsed array to section state.
  function listField(key: string, values: string[] | undefined, onValues: (values: string[]) => void) {
    return {
      value: listFieldDrafts[key] ?? listToText(values),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const raw = event.target.value;
        setListFieldDrafts((drafts) => ({ ...drafts, [key]: raw }));
        onValues(textToList(raw));
      },
    };
  }

  // Newline-separated list textarea: one entry per line, so prose entries with commas
  // ("owns the budget, not just the plan") stay whole (Randall 2026-07-10, input audit #3a).
  function lineListField(key: string, values: string[] | undefined, onValues: (values: string[]) => void) {
    return {
      value: listFieldDrafts[key] ?? linesToText(values),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const raw = event.target.value;
        setListFieldDrafts((drafts) => ({ ...drafts, [key]: raw }));
        onValues(textToLines(raw));
      },
    };
  }

  // value/onChange pair for a compensation input: raw text shows while typing
  // ("$150k", "150,000", "72.50"), the tolerantly-parsed number feeds section state.
  function moneyField(
    key: string,
    current: number | undefined,
    onValue: (value: number | undefined) => void,
    options: { decimals?: boolean } = {},
  ) {
    return {
      value: listFieldDrafts[key] ?? (current === undefined || current === null ? "" : String(current)),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        setListFieldDrafts((drafts) => ({ ...drafts, [key]: raw }));
        onValue(compensationNumber(raw, options));
      },
    };
  }

  // One chip can cover multiple backend values (Contract / freelance).
  function toggleEmploymentType(values: string[]) {
    setIdentity((current) => {
      const on = values.some((value) => current.employmentTypes.includes(value));
      const without = current.employmentTypes.filter((value) => !values.includes(value));
      return { ...current, employmentTypes: on ? without : [...without, ...values] };
    });
  }

  const updateWorkExample = (id: string, patch: Partial<WorkExampleSectionItem>) =>
    setWorkExamples((items) => items.map((example) => (example.id === id ? { ...example, ...patch } : example)));
  const updateSkill = (id: string, patch: Partial<SkillsInventorySectionItem>) =>
    setSkills((items) => items.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)));
  const updateWritingSample = (id: string, patch: Partial<WritingSamplesSectionItem>) =>
    setWritingSamples((samples) => samples.map((sample) => (sample.id === id ? { ...sample, ...patch } : sample)));

  function toggleSkillWorkExample(skill: SkillsInventorySectionItem, workExampleId: string) {
    const ids = new Set(skill.relatedWorkExampleIds);
    if (ids.has(workExampleId)) ids.delete(workExampleId); else ids.add(workExampleId);
    updateSkill(skill.id, { relatedWorkExampleIds: Array.from(ids) });
  }

  function toggleTone(value: string) {
    setVoice((current) => {
      const exists = current.toneTags.some((tag) => tag.toLowerCase() === value.toLowerCase());
      return {
        ...current,
        toneTags: exists
          ? current.toneTags.filter((tag) => tag.toLowerCase() !== value.toLowerCase())
          : [...current.toneTags, value],
      };
    });
  }

  function toggleAvoidTag(value: string) {
    setVoice((current) => {
      const exists = current.avoidTags.some((tag) => tag.toLowerCase() === value.toLowerCase());
      return {
        ...current,
        avoidTags: exists
          ? current.avoidTags.filter((tag) => tag.toLowerCase() !== value.toLowerCase())
          : [...current.avoidTags, value],
      };
    });
  }

  const bucketSamples = (bucket: WritingSampleBucket) => writingSamples.filter((sample) => sample.bucket === bucket);

  function addWritingSample(bucket: WritingSampleBucket) {
    setWritingSamples((samples) => [...samples, emptyWritingSample(bucket)]);
  }

  function removeWritingSample(id: string) {
    setWritingSamples((samples) => samples.filter((sample) => sample.id !== id));
  }

  const avoidNoteWords = countWords(voice.avoidNote);
  const q1Words = countWords(voice.q1Value);
  const q4Words = countWords(voice.q4Opinion);

  /* --- shared section header --- */

  function sectionHeader(
    sectionKey: PublicProfileOnboardingSectionKey,
    title: string,
    optional = false,
    action?: React.ReactNode,
    // Approved Identity & Search card (2026-07-09) drops the kicker label —
    // standing no-eyebrow rule; other sections keep theirs until redesigned.
    eyebrow = true,
  ) {
    const readiness = readinessBySection.get(sectionKey);
    const status = readiness?.status ?? "not_loaded";
    return (
      <div className={styles.formHeader}>
        <div>
          {eyebrow ? <p className={styles.statusLabel}>{optional ? "Optional Section" : "Editable Section"}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ?? (
          <span className={`${styles.readinessBadge} ${styles[`readiness_${status}`]}`}>{readinessLabel(status)}</span>
        )}
      </div>
    );
  }

  // Active-track chip — teal = the lane you're populating. On Card 1 and echoed
  // on every per-track card (onboarding-resume-upload DS card, state 4).
  const trackChip = activeTrack ? (
    <span className={styles.trackChip}><span className={styles.trackChipDot} />{activeTrack.name}</span>
  ) : null;

  // Per-track card header (card-interior spec): title + teal [+] add beside it,
  // active-track chip on the right. onAdd omitted (Fit Signals) → no [+].
  function perTrackHeader(title: string, onAdd?: () => void, addLabel?: string) {
    return (
      <div className={styles.cardHead}>
        <span className={styles.titleGroup}>
          <h3 className={styles.cardTitle}>{title}</h3>
          {onAdd ? (
            <button
              type="button"
              className={styles.addBtn}
              aria-label={addLabel ?? `Add to ${title}`}
              disabled={!accessToken || busy}
              onClick={onAdd}
            >
              +
            </button>
          ) : null}
        </span>
        {trackChip}
      </div>
    );
  }

  // Card-interior intro stack: the "You're populating {track}" orientation line +
  // the card's purpose line share one muted type style (kills the old mixed-font
  // populatingHelper + cardLede collision).
  function cardIntro(purpose: React.ReactNode) {
    return (
      <div className={styles.cardIntro}>
        {activeTrack ? (
          <p>You&apos;re populating <b>{activeTrack.name}</b>. Switch lanes from Card 1&apos;s dropdown.</p>
        ) : null}
        <p>{purpose}</p>
      </div>
    );
  }

  // The mustard thick-stroke edit pencil (card-interior spec). Flips a saved field
  // back to its input.
  function editPencilButton(key: string, label: string) {
    return (
      <button type="button" className={styles.editPencil} aria-label={label} disabled={busy} onClick={() => openField(key)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    );
  }

  // A Voice prose field with the presentation read/edit toggle + word counter.
  // Persistence stays on the card-bottom Save (Randall, 2026-07-11) — no per-field Save.
  function voiceProseField(opts: {
    fieldKey: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    words: number;
    cap: number;
    placeholder: string;
    required?: boolean;
  }) {
    const showRead = opts.value.trim().length > 0 && !isEditing(opts.fieldKey);
    const over = opts.words > opts.cap;
    return (
      <div className={styles.voiceField}>
        <div className={styles.entryFieldHead}>
          <span className={styles.subFieldLabel}>{opts.label}{opts.required ? <span className={styles.requiredMark}> *</span> : null}</span>
          {showRead ? editPencilButton(opts.fieldKey, `Edit ${opts.label.toLowerCase()}`) : null}
        </div>
        {showRead ? (
          <p className={styles.savedText}>{opts.value}</p>
        ) : (
          <>
            <textarea value={opts.value} placeholder={opts.placeholder} onFocus={() => openField(opts.fieldKey)} onChange={(event) => opts.onChange(event.target.value)} />
            <span className={`${styles.wordNote} ${over ? styles.wordNoteOver : ""}`}>
              {over ? `${opts.words}/${opts.cap} words, trim it down` : `${opts.cap}-word limit`}
            </span>
          </>
        )}
      </div>
    );
  }

  const signedIn = Boolean(accessToken);
  const blockedSections = sections.filter(
    (section) => section.required && readinessBySection.get(section.key)?.status === "incomplete",
  );

  // Profile card — a compact full-width bar in every signed-in state (onboarding-account-bar
  // DS card). Identity group left (photo/email/sign out); actions right (Plan, Billing, then
  // Job scan pinned far right once the profile is complete).
  const accountPanel = (
    <section className={styles.accountPanel} aria-label="Profile">
      <div className={styles.accountHead}><span className={styles.accountTitle}>Profile</span></div>
      <div className={styles.profileBar}>
        <div className={styles.identity}>
          <span className={styles.profilePhoto} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M12 14c-5 0-8 2.7-8 6v0h16v0c0-3.3-3-6-8-6z" /></svg>
          </span>
          <span className={styles.profileEmail}>{accountEmail || "Signed in"}</span>
          <button type="button" className={styles.btnSignOut} onClick={signOut}>Sign out</button>
        </div>
        <div className={styles.profileActions}>
          <button type="button" className={styles.btnGhost} onClick={() => setAccountPopup("plan")}>Plan</button>
          <button type="button" className={styles.btnGhost} onClick={() => setAccountPopup("billing")}>Billing</button>
          {profileStatus === "complete" ? (
            <>
              <span className={styles.actionDivider} aria-hidden="true" />
              <button type="button" className={styles.btnScan} onClick={() => router.push("/dashboard")}>
                Job scan
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );

  // Plan / Billing popups. Plan is informational for now; Billing hosts the working
  // access-code redeem field until full billing management ships.
  const accountPopupModal = accountPopup ? (
    <div className={styles.popupOverlay} role="dialog" aria-modal="true" onClick={() => setAccountPopup(null)}>
      <div className={styles.popupCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.popupHead}>
          <h3 className={styles.popupTitle}>{accountPopup === "plan" ? "Plan" : "Billing"}</h3>
          <button type="button" className={styles.popupClose} aria-label="Close" onClick={() => setAccountPopup(null)}>✕</button>
        </div>
        {accountPopup === "plan" ? (
          <div className={styles.popupBody}>
            <p className={styles.popupNote}>{`You're on the ${planLabel(planName)} plan. Plan changes are coming soon.`}</p>
          </div>
        ) : (
          <div className={styles.popupBody}>
            <p className={styles.popupNote}>Payment methods and invoices are coming soon.</p>
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
                onClick={redeemInviteCode}
              >
                Redeem
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Save-blocked review panel — only when a save left required sections incomplete
  // (onboarding-review-panel DS card + design-pass note #8).
  const reviewPanel = reviewOpen && blockedSections.length > 0 ? (
    <div className={styles.reviewPanel} role="status">
      <div className={styles.reviewHead}>
        <h3>{`${blockedSections.length} section${blockedSections.length === 1 ? "" : "s"} need${blockedSections.length === 1 ? "s" : ""} attention before your profile is complete`}</h3>
        <button type="button" className={styles.reviewClose} aria-label="Dismiss review" onClick={() => setReviewOpen(false)}>✕</button>
      </div>
      <p>Fix these and save again. Everything else is already saved.</p>
      <ul className={styles.reviewList}>
        {blockedSections.map((section) => {
          const firstBlocker = readinessBySection.get(section.key)?.blockers[0];
          return (
            <li key={section.key}>
              <span className={styles.reviewDot} />
              <a className={styles.reviewLink} href={`#career-profile-${section.key}`}>
                {firstBlocker ? `${section.label} — ${firstBlocker}` : section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  // Persistent right-column sections rail (onboarding-sections-rail DS card) — replaces
  // the old "Current blockers" text and the full-width bottom section list.
  const sectionsRail = (
    <aside className={styles.rail} aria-label="Profile sections">
      <div className={styles.railHead}>
        <span className={styles.railTitle}>Sections</span>
        <span className={styles.railCount}>
          {profileQuality ? `${completeRequiredSections} of ${requiredSections.length} clear` : `${requiredSections.length} required`}
        </span>
      </div>
      <ul className={styles.railList}>
        {sections.map((section, index) => {
          const readiness = readinessBySection.get(section.key);
          const status = readiness?.status ?? "not_loaded";
          const blockerCount = readiness?.blockers.length ?? 0;
          return (
            <li key={section.key}>
              <a className={styles.railItem} href={`#career-profile-${section.key}`}>
                <span className={styles.railNum}>{index + 1}</span>
                <span className={styles.railText}>
                  <span className={styles.railName}>{section.label}</span>
                  {status === "incomplete" && blockerCount > 0 ? (
                    <span className={styles.railNote}>{`${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`}</span>
                  ) : null}
                </span>
                <span className={`${styles.readinessBadge} ${styles.railBadge} ${styles[`readiness_${status}`]}`}>
                  {readinessLabel(status)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );

  // Signed-out login card — the only thing on the page when signed out
  // (onboarding-signed-out DS card): no editable form, so no dead Save buttons.
  const loginCard = (
    <div className={styles.loginShell}>
      <div className={styles.loginCard}>
        <Image className={styles.loginMascot} src={mascotImg} alt="" sizes="112px" />
        <h2 className={styles.loginTitle}>Sign in to build your profile</h2>
        <p className={styles.loginSub}>Your profile is what makes the outreach sound like you.</p>
        {isGoogleSignInEnabled() ? (
          <div className={styles.authStack}>
            <button type="button" className={styles.googleBtn} disabled={busy} onClick={signInGoogle}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1 2.6-2.1 3.4l3.4 2.6c2-1.84 3.1-4.55 3.1-7.75 0-.74-.07-1.45-.2-2.15z" />
                <path fill="#34A853" d="M6.6 14.3l-.77.6-2.7 2.1C4.8 20 8.1 22 12 22c2.7 0 5-.9 6.65-2.4l-3.4-2.6c-.9.6-2.05.96-3.25.96-2.5 0-4.6-1.7-5.36-3.96z" />
                <path fill="#4285F4" d="M3.13 7c-.7 1.4-1.1 3-1.1 4.7s.4 3.3 1.1 4.7l3.47-2.7c-.2-.6-.32-1.3-.32-2s.12-1.4.32-2z" />
                <path fill="#FBBC05" d="M12 6.04c1.47 0 2.78.5 3.82 1.5l2.85-2.85C16.96 3.06 14.7 2 12 2 8.1 2 4.8 4 3.13 7l3.47 2.7C7.4 7.74 9.5 6.04 12 6.04z" />
              </svg>
              Continue with Google
            </button>
          </div>
        ) : null}
        <div className={styles.authDivider}><span>or use email</span></div>
        <div className={styles.loginField}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        </div>
        <div className={styles.loginField}>
          <label htmlFor="login-pass">Password</label>
          <input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        </div>
        <div className={styles.loginActions}>
          <button type="button" className={styles.loginPrimary} disabled={busy || !email || !password} onClick={signIn}>Sign in</button>
        </div>
        <p className={styles.loginAlt}>New here? <a href="/signup">Create profile</a></p>
        <p className={styles.loginMsg}>{message}</p>
      </div>
    </div>
  );

  // Card 1 save loader — the scan-progress modal (running state only; it closes
  // itself when the save resolves either way).
  const saveLoader = saveProgress.status === "running" ? (
    <div className={loaderStyles.scanOverlay} role="dialog" aria-modal="true" aria-label="Save progress">
      <div className={loaderStyles.scanBox}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={loaderStyles.scanLoadingGif} src="/DF-small.gif" alt="" aria-hidden="true" />
        <div className={loaderStyles.scanModalHead}>
          <h3 className={loaderStyles.scanModalTitle}>Saving</h3>
        </div>
        <div className={loaderStyles.scanProgressTrack} aria-hidden="true">
          <div
            className={loaderStyles.scanProgressFill}
            style={{ width: saveProgress.phase === 0 ? "30%" : saveProgress.phase === 1 ? "62%" : "88%" }}
          />
        </div>
        <div className={loaderStyles.scanPhases} aria-hidden="true">
          {CARD1_SAVE_PHASES.map((label, index) => {
            const phaseClass = index < saveProgress.phase
              ? loaderStyles.scanPhaseDone
              : index === saveProgress.phase
                ? loaderStyles.scanPhaseActive
                : "";
            return <span key={label} className={`${loaderStyles.scanPhase} ${phaseClass}`}>{label}</span>;
          })}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      {saveLoader}
      {accountPopupModal}
      <SiteHeader
        sectionHrefPrefix="/"
        profileHref={signedIn ? "/onboarding" : undefined}
      />

      <div className={styles.shell}>
        {!signedIn ? loginCard : (
          <>
            {accountPanel}
            {reviewPanel}

            <section className={styles.editorGrid} aria-label="Editable onboarding form">
              <div className={styles.formStack}>

          {/* --- Card 1: Role Track + Résumé (onboarding-resume-upload DS card) --- */}
          <article className={`${styles.formCard} ${styles.card1}`} id="career-profile-roleTracks">
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{firstRun ? "Start a Role Track" : "Role Track"}</h3>
              {firstRun ? <span className={styles.step}>Step 1 of onboarding</span> : trackChip}
            </div>

            <div className={styles.card1Field}>
              <label className={styles.card1Label} htmlFor="card1-track-name">{firstRun || creatingTrack ? "Role Track name" : "Role Track"}</label>
              {firstRun || creatingTrack ? (
                <>
                  <input
                    id="card1-track-name"
                    className={styles.trackInput}
                    value={newTrackName}
                    placeholder="Create a new role track"
                    disabled={!accessToken || busy}
                    onChange={(event) => setNewTrackName(event.target.value)}
                  />
                  {firstRun ? (
                    <span className={styles.subhint}>Name the lane you&apos;re pursuing — e.g. Program Director, Producer. Want one résumé to cover everything? Make a general track.</span>
                  ) : (
                    <span className={styles.subhint}>A new track starts from the details of your current one — adjust what&apos;s different for this lane.</span>
                  )}
                </>
              ) : (
                <div className={styles.selectRow} ref={trackSelectRef}>
                  <button
                    type="button"
                    className={styles.selectFace}
                    aria-haspopup="listbox"
                    aria-expanded={trackMenuOpen}
                    disabled={!accessToken || busy}
                    onClick={() => setTrackMenuOpen((open) => !open)}
                  >
                    <span>{activeTrack?.name}</span>
                    <span className={styles.selectCar} aria-hidden="true">{trackMenuOpen ? "▴" : "▾"}</span>
                  </button>
                  {trackMenuOpen ? (
                    <>
                      <div className={styles.selectMenu} role="listbox">
                        {roleTracks.map((track) => (
                          <button
                            key={track.id}
                            type="button"
                            role="option"
                            aria-selected={track.id === activeTrackId}
                            className={`${styles.selectOpt} ${track.id === activeTrackId ? styles.selectOptSel : ""}`}
                            onClick={() => { setActiveTrackId(track.id); setTrackMenuOpen(false); setCard1Note(null); setResumeScan({ status: "idle" }); }}
                          >
                            {track.name || track.id}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`${styles.selectOpt} ${styles.selectOptNew}`}
                          onClick={() => { setCreatingTrack(true); setNewTrackName(""); setTrackMenuOpen(false); setCard1Note(null); setResumeScan({ status: "idle" }); setDraftTitles(activeTrack?.targetTitles ?? []); }}
                        >
                          ＋ Create a new role track
                        </button>
                      </div>
                      <span className={styles.subhint}>A new track starts from the details of your current one — adjust what&apos;s different for this lane.</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className={styles.card1Field}>
              <label className={styles.card1Label} htmlFor="card1-title-input">Job titles</label>
              <TokenListInput
                key={`${creatingTrack ? "new" : activeTrackId || "first"}`}
                inputId="card1-title-input"
                values={titleChips}
                placeholder="Type a title — Enter or comma adds it"
                disabled={!accessToken || busy}
                classes={{ chips: styles.titleTokens, chip: styles.titleToken, remove: styles.x, input: styles.trackInput }}
                onChange={handleTitleChipsChange}
              />
              <span className={styles.subhint}>
                {firstRun || creatingTrack
                  ? "Add every title this track should scan for — each one becomes a search the scan runs."
                  : "The scan searches each of these titles for this track."}
              </span>
            </div>

            <div className={styles.card1Field}>
              <label className={styles.card1Label}>Résumé</label>
              <input
                ref={resumeFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void scanResumePdf(file);
                }}
              />
              {!firstRun && !creatingTrack && attachedResume && resumeScan.status !== "error" ? (
                <>
                  <div className={styles.drop}>
                    <span className={styles.pdfTag}>PDF</span>
                    {resumeScan.status === "reading" ? (
                      <div className={styles.dropMain}>
                        <span className={styles.dropTitle}>{resumeScan.fileName}</span>
                        <div className={styles.uploadTrack} role="progressbar" aria-label="Reading résumé">
                          <div className={styles.uploadFill} />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.fileChip}>
                        <span>{resumeScan.status === "read" ? resumeScan.fileName : attachedResume.name}</span>
                        {resumeScan.status === "read"
                          ? <span className={styles.fileMeta}>{formatFileSize(resumeScan.fileSize)}</span>
                          : card1Note?.fileSize
                            ? <span className={styles.fileMeta}>{formatFileSize(card1Note.fileSize)}</span>
                            : null}
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.chooseBtn}
                      disabled={!accessToken || busy || resumeScan.status === "reading"}
                      onClick={() => resumeFileInputRef.current?.click()}
                    >
                      Replace
                    </button>
                  </div>
                  {card1Note ? (
                    <p className={styles.okNote}>
                      <b>{typeof card1Note.count === "number" && card1Note.count > 0
                        ? `Read — pulled ${card1Note.count} highlight${card1Note.count === 1 ? "" : "s"}.`
                        : "Read."}</b>
                      {` Titles, metrics, and companies routed to the ${card1Note.trackName} lane.`}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div
                    className={`${styles.drop} ${resumeScan.status === "error" ? styles.dropErr : ""}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0];
                      if (file) void scanResumePdf(file);
                    }}
                  >
                    <span className={styles.pdfTag}>PDF</span>
                    {resumeScan.status === "read" ? (
                      <div className={styles.fileChip}>
                        <span>{resumeScan.fileName}</span>
                        <span className={styles.fileMeta}>{formatFileSize(resumeScan.fileSize)}</span>
                      </div>
                    ) : resumeScan.status === "reading" ? (
                      // Upload/read in progress — the scan-progress bar primitive, small,
                      // inside the upload area (Randall, 2026-07-08).
                      <div className={styles.dropMain}>
                        <span className={styles.dropTitle}>{resumeScan.fileName}</span>
                        <div className={styles.uploadTrack} role="progressbar" aria-label="Reading résumé">
                          <div className={styles.uploadFill} />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.dropMain}>
                        <span className={styles.dropTitle}>Drop a PDF here, or choose a file</span>
                        <span className={styles.dropHint}>PDF only · read once to pull quotable highlights · not stored</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.chooseBtn}
                      disabled={!accessToken || busy || resumeScan.status === "reading"}
                      onClick={() => resumeFileInputRef.current?.click()}
                    >
                      {resumeScan.status === "read" ? "Replace" : "Choose PDF"}
                    </button>
                  </div>
                  {resumeScan.status === "error" ? (
                    <p className={styles.errNote}>
                      <b>{resumeScan.lead}</b>
                      {resumeScan.modelDown ? (
                        <> It&apos;s on their end, not yours — check <a href="https://status.claude.com" target="_blank" rel="noreferrer">Anthropic&apos;s status page</a>, try again in a minute, or paste your text below.</>
                      ) : resumeScan.tail ? ` ${resumeScan.tail}` : null}
                    </p>
                  ) : null}
                  {resumeScan.status !== "read" ? (
                    <>
                      <textarea
                        className={styles.resumeTa}
                        placeholder="Or paste your résumé text here…"
                        value={pastedResumeText}
                        disabled={!accessToken || busy || resumeScan.status === "reading"}
                        onChange={(event) => setPastedResumeText(event.target.value)}
                      />
                      <p className={styles.card1Helper}>No file, or a résumé that won&apos;t upload? <b>Paste the text</b> — it feeds highlights exactly the same way.</p>
                    </>
                  ) : null}
                </>
              )}
            </div>

            {firstRun || creatingTrack || !attachedResume || resumeScan.status === "read" || resumeScan.status === "error" ? (
              <button
                type="button"
                className={styles.card1Primary}
                disabled={
                  !accessToken || busy || resumeScan.status === "reading"
                  || !(firstRun || creatingTrack ? newTrackName.trim() : activeTrack?.name.trim())
                  || !(resumeScan.status === "read" || pastedResumeText.trim())
                }
                onClick={() => void saveCard1()}
              >
                Save Role Track &amp; Résumé
              </button>
            ) : null}
            {firstRun ? (
              <p className={styles.lockNote}>🔒 The rest of onboarding unlocks once this is saved.</p>
            ) : null}
          </article>

          {/* Everything below Card 1 stays locked until a Role Track + résumé is saved. */}
          <fieldset className={styles.gateFieldset} disabled={!card1Complete}>

          {/* --- Identity & Search --- */}
          <article className={styles.formCard} id="career-profile-identitySearch">
            {sectionHeader("identitySearch", "Identity & Search", false, undefined, false)}
            <div className={styles.formGrid}>
              <label>Full name<input value={identity.fullName} onChange={(event) => setIdentity({ ...identity, fullName: event.target.value })} /></label>
              <label>Preferred name<input value={identity.preferredName ?? ""} onChange={(event) => setIdentity({ ...identity, preferredName: event.target.value })} /></label>
              <div className={styles.fullWidth}>
                <CataloguePicker
                  kind="locations"
                  mode="single"
                  accessToken={accessToken}
                  label="Location"
                  placeholder="Search a city…"
                  disabled={!accessToken || busy}
                  value={identity.location}
                  onSelect={(value) => setIdentity({ ...identity, location: value })}
                />
              </div>
              <label>Email<input value={identity.email ?? ""} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} /></label>
              <label>Remote preference<select value={identity.remotePreference} onChange={(event) => setIdentity({ ...identity, remotePreference: event.target.value as RemotePreference })}>
                <option value="remote_only">Remote only</option>
                <option value="remote_preferred">Remote preferred</option>
                <option value="hybrid_ok">Hybrid OK</option>
                <option value="onsite_ok">Onsite OK</option>
              </select></label>
              {/* Target compensation — USD; yearly AND hourly, min + preferred each,
                  no toggle (approved Identity & Search card, decisions #3). */}
              <div className={`${styles.fullWidth} ${styles.compGroup}`}>
                <span className={styles.pickerLabel}>Target compensation <span className={styles.compCurrency}>USD</span></span>
                <div className={styles.compRow}>
                  <label><span className={styles.compCap}>Yearly · minimum</span>
                    <input inputMode="decimal" placeholder="$150,000" {...moneyField("identity.compYearlyMin", identity.targetCompensationMin, (value) => setIdentity((current) => ({ ...current, targetCompensationMin: value })))} /></label>
                  <label><span className={styles.compCap}>Yearly · preferred</span>
                    <input inputMode="decimal" placeholder="165k" {...moneyField("identity.compYearlyPreferred", identity.targetCompensationPreferred, (value) => setIdentity((current) => ({ ...current, targetCompensationPreferred: value })))} /></label>
                </div>
                <div className={styles.compRow}>
                  <label><span className={styles.compCap}>Hourly · minimum</span>
                    <input inputMode="decimal" placeholder="72.50" {...moneyField("identity.compHourlyMin", identity.targetCompensationHourlyMin, (value) => setIdentity((current) => ({ ...current, targetCompensationHourlyMin: value })), { decimals: true })} /></label>
                  <label><span className={styles.compCap}>Hourly · preferred</span>
                    <input inputMode="decimal" placeholder="$85" {...moneyField("identity.compHourlyPreferred", identity.targetCompensationHourlyPreferred, (value) => setIdentity((current) => ({ ...current, targetCompensationHourlyPreferred: value })), { decimals: true })} /></label>
                </div>
                <p className={styles.card1Helper}>Type it how you&apos;d say it — <b>&quot;150,000&quot;</b>, <b>&quot;$150k&quot;</b>, and <b>&quot;72.50&quot;</b> all read correctly. Jobs that post either form get matched against both.</p>
              </div>
              {/* Employment types — tap chips (approved card, decision #4). */}
              <div className={`${styles.fullWidth} ${styles.compGroup}`}>
                <span className={styles.pickerLabel}>Employment types</span>
                <div className={styles.chipRow}>
                  {employmentTypeChips.map((chip) => {
                    const on = chip.values.some((value) => identity.employmentTypes.includes(value));
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                        aria-pressed={on}
                        disabled={!accessToken || busy}
                        onClick={() => toggleEmploymentType(chip.values)}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={styles.fullWidth}>
                <CataloguePicker
                  kind="industries"
                  mode="multi"
                  accessToken={accessToken}
                  label="Target industries"
                  placeholder="add your own, it'll match"
                  italicPlaceholder
                  disabled={!accessToken || busy}
                  values={identity.targetIndustries}
                  onAdd={(value) => setIdentity((current) => ({ ...current, targetIndustries: [...current.targetIndustries, value] }))}
                  onRemove={(value) => setIdentity((current) => ({ ...current, targetIndustries: current.targetIndustries.filter((entry) => entry !== value) }))}
                />
              </div>
              <div className={styles.fullWidth}>
                <CataloguePicker
                  kind="industries"
                  mode="multi"
                  accessToken={accessToken}
                  label="Avoid industries"
                  placeholder="add your own, it'll match"
                  italicPlaceholder
                  disabled={!accessToken || busy}
                  values={identity.avoidIndustries}
                  onAdd={(value) => setIdentity((current) => ({ ...current, avoidIndustries: [...current.avoidIndustries, value] }))}
                  onRemove={(value) => setIdentity((current) => ({ ...current, avoidIndustries: current.avoidIndustries.filter((entry) => entry !== value) }))}
                />
              </div>
              {/* Avoid companies — free-text token input (identity-search DS card, approved
                  2026-07-10): the saved list is finally visible as chips right here. */}
              <div className={styles.fullWidth}>
                <div className={styles.pickerField}>
                  <div className={styles.fieldHead}>
                    <span className={styles.pickerLabel}>Avoid companies</span>
                    <span className={styles.fieldHelp}>Enter or comma adds it</span>
                  </div>
                  <TokenListInput
                    values={identity.avoidCompanies ?? []}
                    placeholder="Type a company — Enter or comma adds it"
                    disabled={!accessToken || busy}
                    removeGlyph="✕"
                    classes={{
                      chips: styles.pickerChips,
                      chip: `${styles.chip} ${styles.chipOn}`,
                      remove: styles.chipRemove,
                      input: `${styles.pickerInput} ${styles.pickerInputItalic}`,
                    }}
                    onChange={(values) => setIdentity({ ...identity, avoidCompanies: values })}
                  />
                </div>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveIdentity} type="button">Save Identity & Search</button>
              <p>{message}</p>
            </div>
          </article>

          {/* --- Fit Signals --- */}
          <article className={styles.formCard} id="career-profile-fitSignals">
            {perTrackHeader("Fit Signals")}
            {cardIntro("Soft signals that nudge job ratings up or down. Poor-fit jobs still surface, rated lower, with the reason shown.")}
            {[
              { key: "fit.good", label: "What makes a role a strong fit", draftKey: "fitSignals.goodSignals", values: fitSignals.goodSignals, set: (values: string[]) => setFitSignals({ ...fitSignals, goodSignals: values }) },
              { key: "fit.poor", label: "What makes a role a poor fit", draftKey: "fitSignals.poorFitSignals", values: fitSignals.poorFitSignals, set: (values: string[]) => setFitSignals({ ...fitSignals, poorFitSignals: values }) },
            ].map((field) => {
              const showRead = field.values.length > 0 && !isEditing(field.key);
              return (
                <div className={styles.voiceField} key={field.key}>
                  <div className={styles.entryFieldHead}>
                    <span className={styles.subFieldLabel}>{field.label}</span>
                    {showRead ? editPencilButton(field.key, `Edit ${field.label.toLowerCase()}`) : null}
                  </div>
                  {showRead ? (
                    <p className={styles.savedText}>{linesToText(field.values)}</p>
                  ) : (
                    <textarea onFocus={() => openField(field.key)} {...lineListField(field.draftKey, field.values, field.set)} />
                  )}
                </div>
              );
            })}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveFitSignals} type="button">Save Fit Signals</button>
              <p>One signal per line. These shape rating context, never hard filters.</p>
            </div>
          </article>

          {/* --- Work Examples --- */}
          <article className={styles.formCard} id="career-profile-workExamples">
            {perTrackHeader("Work Examples", () => { setDraftWorkExample(emptyWorkExample()); setOpenWorkExampleId(null); }, "Add work example")}
            {cardIntro("Add examples of your work that are worth mentioning to hiring managers. The one-hitter is the punchy line that can drop straight into a message.")}
            {workExamples.length === 0 && !draftWorkExample ? (
              <p className={styles.emptyState}>No work examples yet. Hit + and add a few with a punchy one-hitter and the context behind it.</p>
            ) : (
              <div className={styles.entryList}>
                {workExamples.map((example) => (
                  openWorkExampleId === example.id ? (
                    <div className={styles.entryOpen} key={example.id}>
                      <button type="button" className={styles.entryOpenHead} onClick={() => setOpenWorkExampleId(null)}>
                        <span className={styles.entryTitle}>{example.title || "Untitled example"}</span>
                        <span className={styles.entryCaret}>▾</span>
                      </button>
                      {savedEntryField({
                        fieldKey: `we.${example.id}.oneHitter`,
                        label: "One-hitter",
                        value: example.oneHitter,
                        onChange: (value) => updateWorkExample(example.id, { oneHitter: value }),
                        onSave: () => void commitWorkExamples(workExamples, () => closeField(`we.${example.id}.oneHitter`)),
                      })}
                      {savedEntryField({
                        fieldKey: `we.${example.id}.link`,
                        label: "Link",
                        value: example.link ?? "",
                        isLink: true,
                        onChange: (value) => updateWorkExample(example.id, { link: value }),
                        onSave: () => void commitWorkExamples(workExamples, () => closeField(`we.${example.id}.link`)),
                      })}
                      {savedEntryField({
                        fieldKey: `we.${example.id}.context`,
                        label: "Context",
                        value: example.context,
                        multiline: true,
                        onChange: (value) => updateWorkExample(example.id, { context: value }),
                        onSave: () => void commitWorkExamples(workExamples, () => closeField(`we.${example.id}.context`)),
                      })}
                      <div className={styles.entryActions}>
                        <button type="button" className={styles.removeGhost} disabled={busy} onClick={() => removeWorkExample(example.id)}>Remove example</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className={styles.entryRow} key={example.id} onClick={() => toggleWorkExampleOpen(example.id)}>
                      <span className={styles.entryTitle}>{example.title || "Untitled example"}</span>
                      <span className={styles.entryCaret}>▸</span>
                    </button>
                  )
                ))}
                {draftWorkExample ? (
                  <div className={styles.entryOpen}>
                    <div className={styles.formGrid}>
                      <label>Title<input value={draftWorkExample.title} placeholder="Name the work" onChange={(event) => setDraftWorkExample({ ...draftWorkExample, title: event.target.value })} /></label>
                      <label>Link (optional)<input value={draftWorkExample.link ?? ""} placeholder="https://" onChange={(event) => setDraftWorkExample({ ...draftWorkExample, link: event.target.value })} /></label>
                      <label className={styles.fullWidth}>One-hitter<input value={draftWorkExample.oneHitter} placeholder="A single punchy line you could drop into a message" onChange={(event) => setDraftWorkExample({ ...draftWorkExample, oneHitter: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Context<textarea value={draftWorkExample.context} placeholder="What it was, what you owned, what came of it" onChange={(event) => setDraftWorkExample({ ...draftWorkExample, context: event.target.value })} /></label>
                    </div>
                    <div className={styles.entryActions}>
                      <button type="button" className={styles.saveSmall} disabled={busy || !draftWorkExample.title.trim()} onClick={saveDraftWorkExample}>Save example</button>
                      <button type="button" className={styles.removeGhost} disabled={busy} onClick={() => setDraftWorkExample(null)}>Discard</button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </article>

          {/* --- Skills --- */}
          <article className={styles.formCard} id="career-profile-skills">
            {perTrackHeader("Skills", () => { setDraftSkill(emptySkill()); setOpenSkillId(null); }, "Add skill")}
            {cardIntro("Back each skill with metrics or results — those lines are what outreach can actually quote.")}
            {skills.length === 0 && !draftSkill ? (
              <p className={styles.emptyState}>No skills yet. Hit + to add one, then back it with metrics or results and link the work behind it.</p>
            ) : (
              <div className={styles.entryList}>
                {skills.map((skill) => (
                  openSkillId === skill.id ? (
                    <div className={styles.entryOpen} key={skill.id}>
                      <button type="button" className={styles.entryOpenHead} onClick={() => setOpenSkillId(null)}>
                        <span className={styles.entryTitle}>{skill.skillName || "Untitled skill"}</span>
                        <span className={styles.profPill}>{proficiencyLabel(skill.proficiency)}</span>
                        <span className={styles.entryCaret}>▾</span>
                      </button>
                      {savedEntryField({
                        fieldKey: `sk.${skill.id}.evidence`,
                        label: "Metrics / Results",
                        onSave: () => void commitSkills(skills, () => closeField(`sk.${skill.id}.evidence`)),
                        readNode: skill.evidence.length > 0
                          ? <p className={styles.savedText}>{linesToText(skill.evidence)}</p>
                          : <p className={`${styles.savedText} ${styles.faint}`}>No metrics or results yet</p>,
                        editNode: <textarea className={styles.entryTa} placeholder="One metric or result per line — numbers beat adjectives" {...lineListField(`skills.${skill.id}.evidence`, skill.evidence, (values) => updateSkill(skill.id, { evidence: values }))} />,
                      })}
                      {savedEntryField({
                        fieldKey: `sk.${skill.id}.related`,
                        label: "Related Work Examples",
                        onSave: () => void commitSkills(skills, () => closeField(`sk.${skill.id}.related`)),
                        readNode: (() => {
                          const titles = skill.relatedWorkExampleIds
                            .map((id) => workExamples.find((example) => example.id === id)?.title)
                            .filter((title): title is string => Boolean(title));
                          return titles.length > 0
                            ? <p className={styles.savedText}>{titles.join(" · ")}</p>
                            : <p className={`${styles.savedText} ${styles.faint}`}>None linked</p>;
                        })(),
                        editNode: workExamples.length > 0 ? (
                          <div className={styles.checkboxGrid}>
                            {workExamples.map((example) => (
                              <label key={example.id}>
                                <input type="checkbox" checked={skill.relatedWorkExampleIds.includes(example.id)} onChange={() => toggleSkillWorkExample(skill, example.id)} />
                                {example.title || example.id}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.emptyState}>Add and save at least one Work Example before linking it here.</p>
                        ),
                      })}
                      <div className={styles.entryActions}>
                        <button type="button" className={styles.removeGhost} disabled={busy} onClick={() => removeSkill(skill.id)}>Remove skill</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className={styles.entryRow} key={skill.id} onClick={() => toggleSkillOpen(skill.id)}>
                      <span className={styles.entryTitle}>{skill.skillName || "Untitled skill"}</span>
                      <span className={styles.profPill}>{proficiencyLabel(skill.proficiency)}</span>
                      <span className={styles.entryCaret}>▸</span>
                    </button>
                  )
                ))}
                {draftSkill ? (
                  <div className={styles.entryOpen}>
                    <div className={styles.formGrid}>
                      <div className={styles.fullWidth}>
                        <CataloguePicker
                          kind="skills"
                          mode="single"
                          accessToken={accessToken}
                          label="Skill"
                          placeholder={draftSkill.skillName || "Search skills…"}
                          disabled={!accessToken || busy}
                          value={draftSkill.skillName}
                          onSelect={(value) => setDraftSkill((current) => (current ? { ...current, skillName: value } : current))}
                        />
                      </div>
                      <label>Proficiency<select value={draftSkill.proficiency} onChange={(event) => setDraftSkill((current) => (current ? { ...current, proficiency: event.target.value as SkillProficiency } : current))}>
                        <option value="working">Working</option>
                        <option value="strong">Strong</option>
                        <option value="expert">Expert</option>
                      </select></label>
                      <label className={styles.fullWidth}>Metrics / Results<textarea placeholder="One metric or result per line — numbers beat adjectives" {...lineListField(`skills.${draftSkill.id}.evidence`, draftSkill.evidence, (values) => setDraftSkill((current) => (current ? { ...current, evidence: values } : current)))} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Related Work Examples</p>
                      {workExamples.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Work Example before linking it here.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {workExamples.map((example) => (
                            <label key={example.id}>
                              <input
                                type="checkbox"
                                checked={draftSkill.relatedWorkExampleIds.includes(example.id)}
                                onChange={() => setDraftSkill((current) => {
                                  if (!current) return current;
                                  const has = current.relatedWorkExampleIds.includes(example.id);
                                  return { ...current, relatedWorkExampleIds: has ? current.relatedWorkExampleIds.filter((id) => id !== example.id) : [...current.relatedWorkExampleIds, example.id] };
                                })}
                              />
                              {example.title || example.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.entryActions}>
                      <button type="button" className={styles.saveSmall} disabled={busy || !draftSkill.skillName.trim()} onClick={saveDraftSkill}>Save skill</button>
                      <button type="button" className={styles.removeGhost} disabled={busy} onClick={() => setDraftSkill(null)}>Discard</button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </article>

          {/* --- Voice & Personality --- */}
          <article className={styles.formCard} id="career-profile-voicePersonality">
            <div className={styles.formHeader}>
              <div><h2>Voice &amp; Personality</h2></div>
            </div>

            {/* How should you sound? — tone chips + avoid note */}
            <div className={styles.voiceGroup}>
              <h3 className={styles.cardTitle}>How should you sound?</h3>
              <div className={styles.cardIntro}><p>Tap the ones that fit. This is the personality we bring to your outreach, so it sounds like you and not a press release.</p></div>
              <ChipGroup
                legend="Lean into"
                presets={leanIntoPresets}
                selected={voice.toneTags}
                onToggle={toggleTone}
                onAddCustom={(value) => setVoice((current) => ({ ...current, toneTags: [...current.toneTags, value] }))}
                onRemoveCustom={(value) => setVoice((current) => ({ ...current, toneTags: current.toneTags.filter((tag) => tag !== value) }))}
                addLabel="+ your own"
                disabled={!accessToken || busy}
              />
              <ChipGroup
                legend="Steer clear"
                presets={steerClearPresets}
                selected={voice.avoidTags}
                onToggle={toggleAvoidTag}
                onAddCustom={(value) => setVoice((current) => ({ ...current, avoidTags: [...current.avoidTags, value] }))}
                onRemoveCustom={(value) => setVoice((current) => ({ ...current, avoidTags: current.avoidTags.filter((tag) => tag !== value) }))}
                addLabel="+ your own"
                disabled={!accessToken || busy}
              />
              {voiceProseField({
                fieldKey: "voice.avoidNote",
                label: "Anything else to avoid?",
                value: voice.avoidNote,
                onChange: (value) => setVoice({ ...voice, avoidNote: value }),
                words: avoidNoteWords,
                cap: avoidNoteWordCap,
                placeholder: 'e.g. never open with "I hope this email finds you well"',
              })}
            </div>

            {/* Things you've already written — writing samples */}
            <div className={styles.voiceGroup}>
              <h3 className={styles.cardTitle}>Things you&apos;ve already written</h3>
              <div className={styles.cardIntro}><p>Paste a few real snippets: an email, a post, a Slack message. This is how we learn your actual voice, so don&apos;t polish them.</p></div>
              <div className={styles.bucketStack}>
                {writingBucketConfigs.map((config) => {
                  const samples = bucketSamples(config.bucket);
                  const canAdd = samples.length < config.max;
                  return (
                    <div className={styles.bucketField} key={config.bucket}>
                      <div className={styles.bucketHead}>
                        <span className={styles.subFieldLabel}>{config.label}{config.required ? <span className={styles.requiredMark}> *</span> : null}</span>
                        {canAdd ? (
                          <button type="button" className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => addWritingSample(config.bucket)}>
                            {samples.length === 0 ? "Add a snippet" : "+ add one more"}
                          </button>
                        ) : null}
                      </div>
                      <p className={styles.bucketHelper}>{config.helper}</p>
                      {samples.length === 0 ? (
                        <p className={styles.emptyState}>No snippet yet.</p>
                      ) : (
                        samples.map((sample) => {
                          const fieldKey = `ws.${sample.id}`;
                          const words = countWords(sample.text);
                          const over = words > writingSampleWordCap;
                          const showRead = sample.text.trim().length > 0 && !isEditing(fieldKey);
                          return (
                            <div className={styles.snippet} key={sample.id}>
                              {showRead ? (
                                <div className={styles.entryFieldHead}>
                                  <p className={styles.savedText}>{sample.text}</p>
                                  {editPencilButton(fieldKey, "Edit snippet")}
                                </div>
                              ) : (
                                <>
                                  <textarea value={sample.text} placeholder={config.placeholder} onFocus={() => openField(fieldKey)} onChange={(event) => updateWritingSample(sample.id, { text: event.target.value })} />
                                  <div className={styles.snippetFoot}>
                                    <span className={`${styles.wordNote} ${over ? styles.wordNoteOver : ""}`}>
                                      {over ? `${words}/${writingSampleWordCap} words, trim it down` : `${writingSampleWordCap}-word limit`}
                                    </span>
                                    <button type="button" className={styles.chipRemove} aria-label="Remove snippet" disabled={busy} onClick={() => removeWritingSample(sample.id)}>✕</button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* In your own words — Q1 / Q4 */}
            <div className={styles.voiceGroup}>
              <h3 className={styles.cardTitle}>In your own words</h3>
              <div className={styles.cardIntro}><p>Two quick ones, in your voice. No right answer, no buzzwords. This is the substance the outreach leans on.</p></div>
              {voiceProseField({
                fieldKey: "voice.q1",
                label: "What are you the person for?",
                value: voice.q1Value,
                onChange: (value) => setVoice({ ...voice, q1Value: value }),
                words: q1Words,
                cap: voiceAnswerWordCap,
                placeholder: "When something specific goes sideways, what makes people come to you?",
                required: true,
              })}
              {voiceProseField({
                fieldKey: "voice.q4",
                label: "A take you'll defend?",
                value: voice.q4Opinion,
                onChange: (value) => setVoice({ ...voice, q4Opinion: value }),
                words: q4Words,
                cap: voiceAnswerWordCap,
                placeholder: "An opinion about your field you'll stand behind, even if it's not the popular one.",
                required: true,
              })}
            </div>

            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveVoiceAndPersonality} type="button">Save Voice & Personality</button>
              <p>Tone tags and one &quot;sounds like me&quot; plus one &quot;never sound like&quot; snippet are required.</p>
            </div>
          </article>

          </fieldset>
        </div>

              {sectionsRail}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
