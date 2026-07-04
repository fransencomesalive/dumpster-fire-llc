"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import styles from "./onboarding.module.css";

/* ============================================================
   Section view models — mirror lib/public-profile/sections.ts
   (the new ~7-section IA from the generator redesign).
   ============================================================ */

type RemotePreference = "remote_only" | "remote_preferred" | "hybrid_ok" | "onsite_ok";

type IdentitySearchSection = {
  fullName: string;
  preferredName?: string;
  location: string;
  linkedInUrl?: string;
  portfolioUrl?: string;
  personalWebsiteUrl?: string;
  email?: string;
  remotePreference: RemotePreference;
  targetCompensationMin?: number;
  targetCompensationPreferred?: number;
  employmentTypes: string[];
  targetIndustries: string[];
  avoidIndustries: string[];
  targetCompanyTypes: string[];
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
  doNotOverclaim: string[];
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
  bestRoleFit: string[];
  doNotOverclaim: string[];
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

type Quality = "weak" | "complete";

type QualityNarrativeSectionField = {
  id: string;
  fieldKey: string;
  value: string;
  quality: Quality;
  feedback?: string;
};

type OutreachRuleSettingsSection = {
  id?: string;
  globalRules: string[];
  followUpRules: string[];
  linkSelectionRules: string[];
};

type RoleTrackOutreachRuleSectionItem = {
  id: string;
  roleTrackId: string;
  rules: string[];
  preferredProofTypes: string[];
  avoidProofTypes: string[];
};

type OutreachRulesSection = {
  settings?: OutreachRuleSettingsSection;
  fields: QualityNarrativeSectionField[];
  roleTrackSpecificRules: RoleTrackOutreachRuleSectionItem[];
};

type LeadershipProfileSection = {
  visible: boolean;
  fields: QualityNarrativeSectionField[];
};

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
};

/* ============================================================
   Constants
   ============================================================ */

const notLoadedReadinessLabel = "Not loaded";
const incompleteProfileJustification = "Without the full picture, outreach won't be good. And if outreach isn't good, your chances drop. Finish your profile.";
const incompleteProfileLockout = "Scanning is locked until the profile is complete. Matching, Saved Jobs, Pursuits, and Human Path stay locked with it.";

const voiceAnswerWordCap = 120;
const avoidNoteWordCap = 25;
const writingSampleWordCap = 120;

// Tone-tag presets (Phase D / D0 control decisions).
const leanIntoPresets = ["punchy", "warm", "no-fluff", "blunt", "funny", "specific", "casual", "brief"];
const steerClearPresets = ["corporate jargon", "biz-formal", "LinkedIn malarky"];

type WritingBucketConfig = {
  bucket: WritingSampleBucket;
  label: string;
  helper: string;
  required: boolean;
  max: number;
};

const writingBucketConfigs: WritingBucketConfig[] = [
  {
    bucket: "sounds_like_me",
    label: "Sounds like me",
    helper: "Paste something you actually wrote. One is enough; add a second only if it shows a different side of your voice.",
    required: true,
    max: 2,
  },
  {
    bucket: "want_to_sound",
    label: "Want to sound like",
    helper: "Optional. Something in someone else's voice you wish yours read like.",
    required: false,
    max: 1,
  },
  {
    bucket: "never_sound",
    label: "Never sound like",
    helper: "One example of writing you never want to be mistaken for.",
    required: true,
    max: 1,
  },
];

const outreachFieldLabels: Record<string, string> = {
  hiringManagerApproach: "Hiring manager approach",
  recruiterApproach: "Recruiter approach",
  functionalLeaderApproach: "Functional leader approach",
  executiveSponsorApproach: "Executive sponsor approach",
  noContactRoutingApproach: "No-contact routing approach",
};

const leadershipFieldLabels: Record<string, string> = {
  leadershipStyle: "Leadership style",
  teamManagementStyle: "Team management style",
  stakeholderManagementStyle: "Stakeholder management style",
  conflictStyle: "Conflict style",
  executiveCommunicationStyle: "Executive communication style",
};

const emptyIdentity: IdentitySearchSection = {
  fullName: "",
  location: "",
  remotePreference: "remote_preferred",
  employmentTypes: [],
  targetIndustries: [],
  avoidIndustries: [],
  targetCompanyTypes: [],
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

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function countWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
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
    doNotOverclaim: [],
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
    bestRoleFit: [],
    doNotOverclaim: [],
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

function emptyOutreachSettings(): OutreachRuleSettingsSection {
  return { globalRules: [], followUpRules: [], linkSelectionRules: [] };
}

function emptyRoleTrackOutreachRule(roleTrackId = ""): RoleTrackOutreachRuleSectionItem {
  return { id: createClientId(), roleTrackId, rules: [], preferredProofTypes: [], avoidProofTypes: [] };
}

function completeOutreachRulesSection(section?: OutreachRulesSection): OutreachRulesSection {
  return {
    settings: section?.settings ?? emptyOutreachSettings(),
    fields: section?.fields ?? [],
    roleTrackSpecificRules: section?.roleTrackSpecificRules ?? [],
  };
}

function completeLeadershipProfileSection(section?: LeadershipProfileSection): LeadershipProfileSection {
  return {
    visible: section?.visible ?? false,
    fields: section?.fields ?? [],
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
      return value.includes("role track");
    case "resumes":
      return value.startsWith("resume ") || value.includes("at least one resume");
    case "workExamples":
      return value.includes("work example");
    case "skills":
      return value.startsWith("skill ") || value.includes("at least one skill");
    case "voicePersonality":
      return value.includes("voice") || value.includes("q1") || value.includes("q4") || value.includes("tone tag") || value.includes("writing sample");
    case "outreachRules":
      return value.includes("outreach") || value.includes("follow-up") || value.includes("link selection");
    case "leadershipProfile":
      return value.includes("leadership");
    default:
      return false;
  }
}

function weakFieldBelongsToSection(sectionKey: PublicProfileOnboardingSectionKey, weakField: string) {
  return reasonBelongsToSection(sectionKey, weakField);
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
  disabled?: boolean;
} & (
  | { mode: "single"; value: string; onSelect: (label: string) => void }
  | { mode: "multi"; values: string[]; onAdd: (label: string) => void; onRemove: (label: string) => void }
);

function CataloguePicker(props: CataloguePickerProps) {
  const { kind, accessToken, label, placeholder, disabled } = props;
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
          setResults(response.results ?? []);
          setActiveIndex(0);
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
  const options: Array<{ key: string; label: string; custom: boolean }> = [
    ...results.map((result) => ({ key: result.id, label: result.label, custom: false })),
  ];
  if (trimmedQuery && !hasExactMatch) {
    options.push({ key: `custom-${trimmedQuery}`, label: trimmedQuery, custom: true });
  }

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
          className={styles.pickerInput}
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
                    className={`${styles.pickerOption} ${index === activeIndex ? styles.pickerOptionActive : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.label)}
                  >
                    {option.custom ? `Add "${option.label}"` : option.label}
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
   Main client
   ============================================================ */

export default function OnboardingClient({
  mode = "onboarding",
  sections,
}: {
  mode?: "onboarding" | "profile-editor";
  sections: PublicProfileOnboardingSection[];
}) {
  const router = useRouter();
  const isProfileEditor = mode === "profile-editor";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [redeemingCode, setRedeemingCode] = useState(false);

  const [identity, setIdentity] = useState<IdentitySearchSection>(emptyIdentity);
  const [fitSignals, setFitSignals] = useState<FitSignalsSection>(emptyFitSignals);
  const [roleTracks, setRoleTracks] = useState<RoleTrackSectionItem[]>([]);
  const [resumes, setResumes] = useState<ResumeUploadSectionItem[]>([]);
  const [workExamples, setWorkExamples] = useState<WorkExampleSectionItem[]>([]);
  const [skills, setSkills] = useState<SkillsInventorySectionItem[]>([]);
  const [voice, setVoice] = useState<VoicePersonalitySection>(emptyVoice);
  const [writingSamples, setWritingSamples] = useState<WritingSamplesSectionItem[]>([]);
  const [outreachRules, setOutreachRules] = useState<OutreachRulesSection>(() => completeOutreachRulesSection());
  const [leadershipProfile, setLeadershipProfile] = useState<LeadershipProfileSection>(() => completeLeadershipProfileSection());

  const [profileStatus, setProfileStatus] = useState<"incomplete" | "complete">("incomplete");
  const [profileQuality, setProfileQuality] = useState<ProfileQualitySummary | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState(isProfileEditor ? "Loading your Career Profile." : "Sign in to start your profile.");
  const [busy, setBusy] = useState(false);

  const requiredSections = useMemo(() => sections.filter((section) => section.required), [sections]);

  const applyProfileQuality = useCallback((summary: ProfileQualitySummary) => {
    setProfileQuality(summary);
    setProfileStatus(summary.status);
    setIssues(summary.incompleteReasons);
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
      outreachRulesResponse,
      leadershipProfileResponse,
    ] = await Promise.all([
      get<IdentitySearchSection>("/api/public-profile/identity-search"),
      get<FitSignalsSection>("/api/public-profile/fit-signals"),
      get<RoleTracksSection>("/api/public-profile/role-tracks"),
      get<ResumeUploadsSection>("/api/public-profile/resumes"),
      get<WorkExamplesSection>("/api/public-profile/work-examples"),
      get<SkillsInventorySection>("/api/public-profile/skills"),
      get<VoicePersonalitySection>("/api/public-profile/voice-personality"),
      get<WritingSamplesSection>("/api/public-profile/writing-samples"),
      get<OutreachRulesSection>("/api/public-profile/outreach-rules"),
      get<LeadershipProfileSection>("/api/public-profile/leadership-profile"),
    ]);

    setIdentity(identityResponse.section);
    setFitSignals(fitSignalsResponse.section);
    setRoleTracks(roleTracksResponse.section.roleTracks);
    setResumes(resumeResponse.section.resumes);
    setWorkExamples(workExamplesResponse.section.workExamples);
    setSkills(skillsResponse.section.skills);
    setVoice(voiceResponse.section);
    setWritingSamples(writingSamplesResponse.section.writingSamples);
    setOutreachRules(completeOutreachRulesSection(outreachRulesResponse.section));
    setLeadershipProfile(completeLeadershipProfileSection(leadershipProfileResponse.section));
    applyProfileQuality(identityResponse.profileQuality ?? bootstrap.profileQuality);
    setMessage("Profile sections loaded.");
  }, [applyProfileQuality]);

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

  useEffect(() => {
    if (!isProfileEditor && profileQuality?.status === "complete") {
      router.replace("/dashboard");
    }
  }, [isProfileEditor, profileQuality?.status, router]);

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
      await signInWithGoogle("/onboarding");
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
      setMessage(`Access code accepted: ${result.planName} plan is active.`);
    } catch (error) {
      const body = (error as { body?: { error?: string } }).body;
      setMessage(body?.error || "That code did not work.");
    } finally {
      setRedeemingCode(false);
    }
  }

  async function reloadProfile() {
    if (!accessToken) return;
    setBusy(true);
    setMessage("Reloading profile sections…");
    try {
      await loadProfile(accessToken);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reload failed.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
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
    setOutreachRules(completeOutreachRulesSection());
    setLeadershipProfile(completeLeadershipProfileSection());
    setProfileStatus("incomplete");
    setProfileQuality(null);
    setIssues([]);
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
    saveSection<FitSignalsSection>("Fit Signals", "/api/public-profile/fit-signals", fitSignals, (section) => setFitSignals(section));
  const saveRoleTracks = () =>
    saveSection<RoleTracksSection>("Role Tracks", "/api/public-profile/role-tracks", { roleTracks }, (section) => setRoleTracks(section.roleTracks));
  const saveResumes = () =>
    saveSection<ResumeUploadsSection>("Resumes", "/api/public-profile/resumes", { resumes }, (section) => setResumes(section.resumes));
  const saveWorkExamples = () =>
    saveSection<WorkExamplesSection>("Work Examples", "/api/public-profile/work-examples", { workExamples }, (section) => setWorkExamples(section.workExamples));
  const saveSkills = () =>
    saveSection<SkillsInventorySection>("Skills", "/api/public-profile/skills", { skills }, (section) => setSkills(section.skills));
  const saveOutreachRules = () =>
    saveSection<OutreachRulesSection>("Outreach Rules", "/api/public-profile/outreach-rules", outreachRules, (section) => setOutreachRules(completeOutreachRulesSection(section)));
  const saveLeadership = () =>
    saveSection<LeadershipProfileSection>("Leadership Profile", "/api/public-profile/leadership-profile", leadershipProfile, (section) => setLeadershipProfile(completeLeadershipProfileSection(section)));

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
      setMessage("Voice & Personality saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  /* --- per-item state updates --- */

  const updateRoleTrack = (id: string, patch: Partial<RoleTrackSectionItem>) =>
    setRoleTracks((tracks) => tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  const updateResume = (id: string, patch: Partial<ResumeUploadSectionItem>) =>
    setResumes((items) => items.map((resume) => (resume.id === id ? { ...resume, ...patch } : resume)));
  const updateWorkExample = (id: string, patch: Partial<WorkExampleSectionItem>) =>
    setWorkExamples((items) => items.map((example) => (example.id === id ? { ...example, ...patch } : example)));
  const updateSkill = (id: string, patch: Partial<SkillsInventorySectionItem>) =>
    setSkills((items) => items.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)));
  const updateWritingSample = (id: string, patch: Partial<WritingSamplesSectionItem>) =>
    setWritingSamples((samples) => samples.map((sample) => (sample.id === id ? { ...sample, ...patch } : sample)));

  function toggleResumeRoleTrack(resume: ResumeUploadSectionItem, roleTrackId: string) {
    const ids = new Set(resume.associatedRoleTrackIds);
    if (ids.has(roleTrackId)) ids.delete(roleTrackId); else ids.add(roleTrackId);
    updateResume(resume.id, { associatedRoleTrackIds: Array.from(ids) });
  }

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

  function sectionHeader(sectionKey: PublicProfileOnboardingSectionKey, title: string, optional = false, action?: React.ReactNode) {
    const readiness = readinessBySection.get(sectionKey);
    const status = readiness?.status ?? "not_loaded";
    return (
      <div className={styles.formHeader}>
        <div>
          <p className={styles.statusLabel}>{optional ? "Optional Section" : "Editable Section"}</p>
          <h2>{title}</h2>
        </div>
        {action ?? (
          <span className={`${styles.readinessBadge} ${styles[`readiness_${status}`]}`}>{readinessLabel(status)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={isProfileEditor ? styles.profileEditorMode : undefined}>
      <section className={isProfileEditor ? styles.authPanelCompact : styles.authPanel} aria-label="Profile sign in">
        <div>
          <p className={styles.statusLabel}>Account</p>
          <p className={styles.statusDetail}>{accessToken ? "Signed in." : "Sign in to continue."}</p>
        </div>
        {accessToken ? (
          <div className={styles.authActions}>
            <button className={styles.secondaryButton} disabled={busy} onClick={reloadProfile} type="button">Reload</button>
            {!isProfileEditor && profileQuality?.status === "complete" ? (
              <button className={styles.secondaryButton} disabled={busy} onClick={() => router.push("/dashboard")} type="button">Go to dashboard</button>
            ) : null}
            <button className={styles.secondaryButton} onClick={signOut} type="button">Sign out</button>
            <input aria-label="Access code" onChange={(event) => setInviteCode(event.target.value)} placeholder="Access code" type="text" value={inviteCode} />
            <button className={styles.secondaryButton} disabled={redeemingCode || !inviteCode.trim()} onClick={redeemInviteCode} type="button">Redeem</button>
          </div>
        ) : (
          <div className={styles.authForm}>
            <input aria-label="Email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" type="email" value={email} />
            <input aria-label="Password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" value={password} />
            <button className={styles.primaryButton} disabled={busy || !email || !password} onClick={signIn} type="button">Sign in</button>
            {isGoogleSignInEnabled() ? (
              <button className={styles.secondaryButton} disabled={busy} onClick={signInGoogle} type="button">Continue with Google</button>
            ) : null}
          </div>
        )}
      </section>

      <section className={isProfileEditor ? styles.readinessPanelCompact : styles.readinessPanel} aria-label="Profile readiness summary">
        <div>
          <p className={styles.statusLabel}>Profile Readiness</p>
          <p className={styles.statusValue}>{profileQuality ? (profileStatus === "complete" ? "Complete" : "Incomplete") : notLoadedReadinessLabel}</p>
          <p className={styles.statusDetail}>
            {profileQuality
              ? `${completeRequiredSections} of ${requiredSections.length} required sections currently clear. ${issues.length} blocker${issues.length === 1 ? "" : "s"} remain.`
              : "Sign in to load section readiness, blocker counts, and weak profile fields."}
          </p>
          {profileQuality?.status === "incomplete" ? (
            <div className={styles.gateNotice} role="status">
              <p>{incompleteProfileJustification}</p>
              <p>{incompleteProfileLockout}</p>
            </div>
          ) : null}
        </div>
        <div className={styles.readinessStats}>
          <span>{profileQuality?.weakResponseCount ?? 0} weak response{(profileQuality?.weakResponseCount ?? 0) === 1 ? "" : "s"}</span>
          <span>{profileQuality?.lastCheckedAt ? `Checked ${new Date(profileQuality.lastCheckedAt).toLocaleString()}` : "Not checked yet"}</span>
        </div>
      </section>

      <section className={`${styles.editorGrid} ${isProfileEditor ? styles.profileEditorGrid : ""}`} aria-label="Editable onboarding form">
        <div className={styles.formStack}>

          {/* --- Identity & Search --- */}
          <article className={styles.formCard} id="career-profile-identitySearch">
            {sectionHeader("identitySearch", "Identity & Search")}
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
              <label>Target compensation minimum<input inputMode="numeric" value={identity.targetCompensationMin ?? ""} onChange={(event) => setIdentity({ ...identity, targetCompensationMin: optionalNumber(event.target.value) })} /></label>
              <label>Target compensation preferred<input inputMode="numeric" value={identity.targetCompensationPreferred ?? ""} onChange={(event) => setIdentity({ ...identity, targetCompensationPreferred: optionalNumber(event.target.value) })} /></label>
              <label>LinkedIn URL<input value={identity.linkedInUrl ?? ""} onChange={(event) => setIdentity({ ...identity, linkedInUrl: event.target.value })} /></label>
              <label>Portfolio URL<input value={identity.portfolioUrl ?? ""} onChange={(event) => setIdentity({ ...identity, portfolioUrl: event.target.value })} /></label>
              <label>Personal site URL<input value={identity.personalWebsiteUrl ?? ""} onChange={(event) => setIdentity({ ...identity, personalWebsiteUrl: event.target.value })} /></label>
              <label>Employment types<input value={listToText(identity.employmentTypes)} onChange={(event) => setIdentity({ ...identity, employmentTypes: textToList(event.target.value) })} /></label>
              <div className={styles.fullWidth}>
                <CataloguePicker
                  kind="industries"
                  mode="multi"
                  accessToken={accessToken}
                  label="Target industries"
                  placeholder="Search industries…"
                  disabled={!accessToken || busy}
                  values={identity.targetIndustries}
                  onAdd={(value) => setIdentity((current) => ({ ...current, targetIndustries: [...current.targetIndustries, value] }))}
                  onRemove={(value) => setIdentity((current) => ({ ...current, targetIndustries: current.targetIndustries.filter((entry) => entry !== value) }))}
                />
              </div>
              <label>Avoid industries<input value={listToText(identity.avoidIndustries)} onChange={(event) => setIdentity({ ...identity, avoidIndustries: textToList(event.target.value) })} /></label>
              <label>Target company types<input value={listToText(identity.targetCompanyTypes)} onChange={(event) => setIdentity({ ...identity, targetCompanyTypes: textToList(event.target.value) })} /></label>
              <label>Avoid companies<input value={listToText(identity.avoidCompanies)} onChange={(event) => setIdentity({ ...identity, avoidCompanies: textToList(event.target.value) })} /></label>
            </div>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveIdentity} type="button">Save Identity & Search</button>
              <p>{message}</p>
            </div>
          </article>

          {/* --- Fit Signals --- */}
          <article className={styles.formCard} id="career-profile-fitSignals">
            {sectionHeader("fitSignals", "Fit Signals", true)}
            <p className={styles.cardLede}>Soft signals that nudge job ratings up or down. Poor-fit jobs still surface, rated lower, with the reason shown.</p>
            <div className={styles.formGrid}>
              <label className={styles.fullWidth}>What makes a role a strong fit<textarea value={listToText(fitSignals.goodSignals)} onChange={(event) => setFitSignals({ ...fitSignals, goodSignals: textToList(event.target.value) })} /></label>
              <label className={styles.fullWidth}>What makes a role a poor fit<textarea value={listToText(fitSignals.poorFitSignals)} onChange={(event) => setFitSignals({ ...fitSignals, poorFitSignals: textToList(event.target.value) })} /></label>
            </div>
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveFitSignals} type="button">Save Fit Signals</button>
              <p>Comma-separate signals. These shape rating context, never hard filters.</p>
            </div>
          </article>

          {/* --- Role Tracks --- */}
          <article className={styles.formCard} id="career-profile-roleTracks">
            {sectionHeader("roleTracks", "Role Tracks", false, (
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setRoleTracks((tracks) => [...tracks, emptyRoleTrack()])} type="button">Add Role Track</button>
            ))}
            {roleTracks.length === 0 ? (
              <p className={styles.emptyState}>No Role Tracks yet. A Role Track is one credible lane you pursue, connecting the resumes, work examples, and outreach rules that fit it. For example, apply as a Project Manager in one Role Track and as a Producer in another.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {roleTracks.map((track, index) => (
                  <div className={styles.roleTrackEditor} key={track.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Track {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setRoleTracks((tracks) => tracks.filter((item) => item.id !== track.id))} type="button">Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Name<input value={track.name} onChange={(event) => updateRoleTrack(track.id, { name: event.target.value })} /></label>
                      <label>Target titles<input value={listToText(track.targetTitles)} onChange={(event) => updateRoleTrack(track.id, { targetTitles: textToList(event.target.value) })} /></label>
                      <label className={styles.fullWidth}>Description<textarea value={track.description} onChange={(event) => updateRoleTrack(track.id, { description: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Core positioning<textarea value={track.corePositioning} onChange={(event) => updateRoleTrack(track.id, { corePositioning: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Outreach angle<textarea value={track.outreachAngle} onChange={(event) => updateRoleTrack(track.id, { outreachAngle: event.target.value })} /></label>
                      <label>Key responsibilities<textarea value={listToText(track.keyResponsibilities)} onChange={(event) => updateRoleTrack(track.id, { keyResponsibilities: textToList(event.target.value) })} /></label>
                      <label>Required experience patterns<textarea value={listToText(track.requiredExperiencePatterns)} onChange={(event) => updateRoleTrack(track.id, { requiredExperiencePatterns: textToList(event.target.value) })} /></label>
                      <label>Strong job signals<textarea value={listToText(track.strongJobSignals)} onChange={(event) => updateRoleTrack(track.id, { strongJobSignals: textToList(event.target.value) })} /></label>
                      <label>Weak job signals<textarea value={listToText(track.weakJobSignals)} onChange={(event) => updateRoleTrack(track.id, { weakJobSignals: textToList(event.target.value) })} /></label>
                      <label>Mismatch signals<textarea value={listToText(track.mismatchSignals)} onChange={(event) => updateRoleTrack(track.id, { mismatchSignals: textToList(event.target.value) })} /></label>
                      <label>Do not overclaim<textarea value={listToText(track.doNotOverclaim)} onChange={(event) => updateRoleTrack(track.id, { doNotOverclaim: textToList(event.target.value) })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveRoleTracks} type="button">Save Role Tracks</button>
              <p>Comma-separate list fields. Resume connections stay linked to the selected Role Tracks.</p>
            </div>
          </article>

          {/* --- Resumes --- */}
          <article className={styles.formCard} id="career-profile-resumes">
            {sectionHeader("resumes", "Resumes", false, (
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setResumes((items) => [...items, emptyResume()])} type="button">Add Resume</button>
            ))}
            {resumes.length === 0 ? (
              <p className={styles.emptyState}>No resumes yet. Add a resume record and attach it to at least one Role Track.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {resumes.map((resume, index) => (
                  <div className={styles.roleTrackEditor} key={resume.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Resume {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setResumes((items) => items.filter((item) => item.id !== resume.id))} type="button">Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Name<input value={resume.name} onChange={(event) => updateResume(resume.id, { name: event.target.value })} /></label>
                      <label>Resume link<input value={resume.fileUrl} onChange={(event) => updateResume(resume.id, { fileUrl: event.target.value })} /></label>
                      <label>Resume readiness<select value={resume.parsingQuality} onChange={(event) => updateResume(resume.id, { parsingQuality: event.target.value as ParsingQuality })}>
                        <option value="failed">Needs rebuild</option>
                        <option value="weak">Needs cleanup</option>
                        <option value="complete">Ready</option>
                      </select></label>
                      <label>Strengths<textarea value={listToText(resume.strengths)} onChange={(event) => updateResume(resume.id, { strengths: textToList(event.target.value) })} /></label>
                      <label>Gaps<textarea value={listToText(resume.gaps)} onChange={(event) => updateResume(resume.id, { gaps: textToList(event.target.value) })} /></label>
                      <label>Use when<textarea value={listToText(resume.useWhen)} onChange={(event) => updateResume(resume.id, { useWhen: textToList(event.target.value) })} /></label>
                      <label>Avoid when<textarea value={listToText(resume.avoidWhen)} onChange={(event) => updateResume(resume.id, { avoidWhen: textToList(event.target.value) })} /></label>
                      <label>Cleanup notes<textarea value={listToText(resume.parsingIssues)} onChange={(event) => updateResume(resume.id, { parsingIssues: textToList(event.target.value) })} /></label>
                      <label className={styles.fullWidth}>Resume text<textarea value={resume.parsedText} onChange={(event) => updateResume(resume.id, { parsedText: event.target.value })} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Attach to Role Tracks</p>
                      {roleTracks.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Role Track before saving resume attachments.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {roleTracks.map((track) => (
                            <label key={track.id}>
                              <input checked={resume.associatedRoleTrackIds.includes(track.id)} onChange={() => toggleResumeRoleTrack(resume, track.id)} type="checkbox" />
                              {track.name || track.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveResumes} type="button">Save Resumes</button>
              <p>Add resume text or a link here, then connect the resume to the Role Tracks it supports.</p>
            </div>
          </article>

          {/* --- Work Examples --- */}
          <article className={styles.formCard} id="career-profile-workExamples">
            {sectionHeader("workExamples", "Work Examples", false, (
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setWorkExamples((items) => [...items, emptyWorkExample()])} type="button">Add Work Example</button>
            ))}
            <p className={styles.cardLede}>Text-only examples the outreach generator can reach for. The one-hitter is the punchy line that can drop straight into a message.</p>
            {workExamples.length === 0 ? (
              <p className={styles.emptyState}>No work examples yet. Add a few with a punchy one-hitter and the context behind it.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {workExamples.map((example, index) => (
                  <div className={styles.roleTrackEditor} key={example.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Example {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setWorkExamples((items) => items.filter((item) => item.id !== example.id))} type="button">Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Title<input value={example.title} onChange={(event) => updateWorkExample(example.id, { title: event.target.value })} /></label>
                      <label>Link (optional)<input value={example.link ?? ""} onChange={(event) => updateWorkExample(example.id, { link: event.target.value })} /></label>
                      <label className={styles.fullWidth}>One-hitter<input value={example.oneHitter} placeholder="A single punchy line you could drop into a message" onChange={(event) => updateWorkExample(example.id, { oneHitter: event.target.value })} /></label>
                      <label className={styles.fullWidth}>Context<textarea value={example.context} onChange={(event) => updateWorkExample(example.id, { context: event.target.value })} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveWorkExamples} type="button">Save Work Examples</button>
              <p>Keep examples text-only. The generator picks the most relevant one per message.</p>
            </div>
          </article>

          {/* --- Skills --- */}
          <article className={styles.formCard} id="career-profile-skills">
            {sectionHeader("skills", "Skills", false, (
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setSkills((items) => [...items, emptySkill()])} type="button">Add Skill</button>
            ))}
            {skills.length === 0 ? (
              <p className={styles.emptyState}>No skills yet. Search the catalogue or add your own, then back each one with evidence and guardrails.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {skills.map((skill, index) => (
                  <div className={styles.roleTrackEditor} key={skill.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Skill {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setSkills((items) => items.filter((item) => item.id !== skill.id))} type="button">Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.fullWidth}>
                        <CataloguePicker
                          kind="skills"
                          mode="single"
                          accessToken={accessToken}
                          label="Skill"
                          placeholder={skill.skillName || "Search skills…"}
                          disabled={!accessToken || busy}
                          value={skill.skillName}
                          onSelect={(value) => updateSkill(skill.id, { skillName: value })}
                        />
                      </div>
                      <label>Proficiency<select value={skill.proficiency} onChange={(event) => updateSkill(skill.id, { proficiency: event.target.value as SkillProficiency })}>
                        <option value="working">Working</option>
                        <option value="strong">Strong</option>
                        <option value="expert">Expert</option>
                      </select></label>
                      <label>Evidence<textarea value={listToText(skill.evidence)} onChange={(event) => updateSkill(skill.id, { evidence: textToList(event.target.value) })} /></label>
                      <label>Best role fit<textarea value={listToText(skill.bestRoleFit)} onChange={(event) => updateSkill(skill.id, { bestRoleFit: textToList(event.target.value) })} /></label>
                      <label>Do not overclaim<textarea value={listToText(skill.doNotOverclaim)} onChange={(event) => updateSkill(skill.id, { doNotOverclaim: textToList(event.target.value) })} /></label>
                    </div>
                    <div className={styles.attachmentBlock}>
                      <p className={styles.statusLabel}>Related Work Examples</p>
                      {workExamples.length === 0 ? (
                        <p className={styles.emptyState}>Add and save at least one Work Example before linking it here.</p>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {workExamples.map((example) => (
                            <label key={example.id}>
                              <input checked={skill.relatedWorkExampleIds.includes(example.id)} onChange={() => toggleSkillWorkExample(skill, example.id)} type="checkbox" />
                              {example.title || example.id}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveSkills} type="button">Save Skills</button>
              <p>Comma-separate evidence, fit, and overclaim guardrails. Save related Work Examples first.</p>
            </div>
          </article>

          {/* --- Voice & Personality --- */}
          <article className={styles.formCard} id="career-profile-voicePersonality">
            {sectionHeader("voicePersonality", "Voice & Personality")}
            <p className={styles.cardLede}>Tap what fits, paste a little of your real writing, then answer two quick questions in your own words.</p>

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
            <label className={styles.voiceField}>
              <span className={styles.subFieldLabel}>Anything else to avoid?</span>
              <textarea value={voice.avoidNote} onChange={(event) => setVoice({ ...voice, avoidNote: event.target.value })} />
              <span className={`${styles.wordNote} ${avoidNoteWords > avoidNoteWordCap ? styles.wordNoteOver : ""}`}>
                {avoidNoteWords > avoidNoteWordCap ? `${avoidNoteWords}/${avoidNoteWordCap} words, trim it down` : `${avoidNoteWordCap}-word limit`}
              </span>
            </label>

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
                        const words = countWords(sample.text);
                        const over = words > writingSampleWordCap;
                        return (
                          <div className={styles.snippet} key={sample.id}>
                            <textarea value={sample.text} onChange={(event) => updateWritingSample(sample.id, { text: event.target.value })} />
                            <div className={styles.snippetFoot}>
                              <span className={`${styles.wordNote} ${over ? styles.wordNoteOver : ""}`}>
                                {over ? `${words}/${writingSampleWordCap} words, trim it down` : `${writingSampleWordCap}-word limit`}
                              </span>
                              <button type="button" className={styles.chipRemove} aria-label="Remove snippet" disabled={busy} onClick={() => removeWritingSample(sample.id)}>✕</button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            <label className={styles.voiceField}>
              <span className={styles.subFieldLabel}>What are you the person for?<span className={styles.requiredMark}> *</span></span>
              <textarea value={voice.q1Value} placeholder="What do people come to you for?" onChange={(event) => setVoice({ ...voice, q1Value: event.target.value })} />
              <span className={`${styles.wordNote} ${q1Words > voiceAnswerWordCap ? styles.wordNoteOver : ""}`}>
                {q1Words > voiceAnswerWordCap ? `${q1Words}/${voiceAnswerWordCap} words, trim it down` : `${voiceAnswerWordCap}-word limit`}
              </span>
            </label>
            <label className={styles.voiceField}>
              <span className={styles.subFieldLabel}>A take you&apos;ll defend?<span className={styles.requiredMark}> *</span></span>
              <textarea value={voice.q4Opinion} placeholder="An opinion about your field you'll stand behind" onChange={(event) => setVoice({ ...voice, q4Opinion: event.target.value })} />
              <span className={`${styles.wordNote} ${q4Words > voiceAnswerWordCap ? styles.wordNoteOver : ""}`}>
                {q4Words > voiceAnswerWordCap ? `${q4Words}/${voiceAnswerWordCap} words, trim it down` : `${voiceAnswerWordCap}-word limit`}
              </span>
            </label>

            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveVoiceAndPersonality} type="button">Save Voice & Personality</button>
              <p>Tone tags and one &quot;sounds like me&quot; plus one &quot;never sound like&quot; snippet are required.</p>
            </div>
          </article>

          {/* --- Outreach Rules --- */}
          <article className={styles.formCard} id="career-profile-outreachRules">
            {sectionHeader("outreachRules", "Outreach Rules", false, (
              <button className={styles.secondaryButton} disabled={!accessToken || busy} onClick={() => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: [...section.roleTrackSpecificRules, emptyRoleTrackOutreachRule(roleTracks[0]?.id)] }))} type="button">Add Role Rule</button>
            ))}
            <div className={styles.formGrid}>
              <label>Global rules<textarea value={listToText(outreachRules.settings?.globalRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), globalRules: textToList(event.target.value) } }))} /></label>
              <label>Follow-up rules<textarea value={listToText(outreachRules.settings?.followUpRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), followUpRules: textToList(event.target.value) } }))} /></label>
              <label>Link selection rules<textarea value={listToText(outreachRules.settings?.linkSelectionRules)} onChange={(event) => setOutreachRules((section) => ({ ...section, settings: { ...(section.settings ?? emptyOutreachSettings()), linkSelectionRules: textToList(event.target.value) } }))} /></label>
            </div>
            {outreachRules.fields.length > 0 ? (
              <div className={styles.roleTrackList}>
                {outreachRules.fields.map((field) => (
                  <div className={styles.roleTrackEditor} key={field.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>{outreachFieldLabels[field.fieldKey] ?? field.fieldKey}</h3>
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.fullWidth}>Response<textarea value={field.value} onChange={(event) => setOutreachRules((section) => ({ ...section, fields: section.fields.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item) }))} /></label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {outreachRules.roleTrackSpecificRules.length === 0 ? (
              <p className={styles.emptyState}>No Role Track-specific outreach rules yet. Add Role Tracks first if outreach varies by lane.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {outreachRules.roleTrackSpecificRules.map((rule, index) => (
                  <div className={styles.roleTrackEditor} key={rule.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>Role Rule {index + 1}</h3>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: section.roleTrackSpecificRules.filter((item) => item.id !== rule.id) }))} type="button">Remove</button>
                    </div>
                    <div className={styles.formGrid}>
                      <label>Role Track<select value={rule.roleTrackId} onChange={(event) => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: section.roleTrackSpecificRules.map((item) => item.id === rule.id ? { ...item, roleTrackId: event.target.value } : item) }))}>
                        <option value="">Choose a Role Track</option>
                        {roleTracks.map((track) => (<option key={track.id} value={track.id}>{track.name || track.id}</option>))}
                      </select></label>
                      <label>Rules<textarea value={listToText(rule.rules)} onChange={(event) => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: section.roleTrackSpecificRules.map((item) => item.id === rule.id ? { ...item, rules: textToList(event.target.value) } : item) }))} /></label>
                      <label>Preferred work example types<textarea value={listToText(rule.preferredProofTypes)} onChange={(event) => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: section.roleTrackSpecificRules.map((item) => item.id === rule.id ? { ...item, preferredProofTypes: textToList(event.target.value) } : item) }))} /></label>
                      <label>Avoid work example types<textarea value={listToText(rule.avoidProofTypes)} onChange={(event) => setOutreachRules((section) => ({ ...section, roleTrackSpecificRules: section.roleTrackSpecificRules.map((item) => item.id === rule.id ? { ...item, avoidProofTypes: textToList(event.target.value) } : item) }))} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveOutreachRules} type="button">Save Outreach Rules</button>
              <p>Save Role Tracks before saving role-specific outreach rules so relationship IDs validate.</p>
            </div>
          </article>

          {/* --- Leadership Profile --- */}
          <article className={styles.formCard} id="career-profile-leadershipProfile">
            {sectionHeader("leadershipProfile", "Leadership Profile", true, (
              <label className={styles.checkboxLabel}>
                <input checked={leadershipProfile.visible} onChange={(event) => setLeadershipProfile((section) => ({ ...section, visible: event.target.checked }))} type="checkbox" />
                Visible
              </label>
            ))}
            {leadershipProfile.fields.length === 0 ? (
              <p className={styles.emptyState}>Optional. Turn on visibility to include leadership positioning in generated outputs.</p>
            ) : (
              <div className={styles.roleTrackList}>
                {leadershipProfile.fields.map((field) => (
                  <div className={styles.roleTrackEditor} key={field.id}>
                    <div className={styles.roleTrackHeader}>
                      <h3>{leadershipFieldLabels[field.fieldKey] ?? field.fieldKey}</h3>
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.fullWidth}>Response<textarea value={field.value} onChange={(event) => setLeadershipProfile((section) => ({ ...section, fields: section.fields.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item) }))} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryButton} disabled={!accessToken || busy} onClick={saveLeadership} type="button">Save Leadership Profile</button>
              <p>Keep hidden unless leadership or executive positioning should appear in generated outputs.</p>
            </div>
          </article>
        </div>

        <aside className={styles.issueCard}>
          <p className={styles.statusLabel}>Current blockers</p>
          {issues.length === 0 ? (
            <p>{profileQuality?.status === "complete" ? "Profile complete. Scan and downstream workflow gates can open." : "No profile blockers loaded yet."}</p>
          ) : (
            <ul>
              {issues.slice(0, 8).map((issue) => (<li key={issue}>{issue}</li>))}
            </ul>
          )}
        </aside>
      </section>

      {!isProfileEditor ? (
        <>
          <section id="sections" className={styles.sectionList} aria-label="Onboarding sections">
            {sections.map((section, index) => {
              const readiness = readinessBySection.get(section.key);
              const status = readiness?.status ?? "not_loaded";
              const blockerCount = readiness?.blockers.length ?? 0;
              const weakFieldCount = readiness?.weakFields.length ?? 0;
              return (
                <article className={styles.sectionCard} key={section.key}>
                  <span className={styles.index}>{index + 1}</span>
                  <div>
                    <h2>{section.label}</h2>
                    <p>{section.description}</p>
                    <p className={styles.sectionIssueSummary}>
                      {profileQuality
                        ? section.required
                          ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}${weakFieldCount > 0 ? ` · ${weakFieldCount} weak field${weakFieldCount === 1 ? "" : "s"}` : ""}`
                          : "Optional section, not required for completion"
                        : "Sign in to load readiness"}
                    </p>
                  </div>
                  <div className={styles.sectionMeta}>
                    <span className={`${styles.readinessBadge} ${styles[`readiness_${status}`]}`}>{readinessLabel(status)}</span>
                  </div>
                </article>
              );
            })}
          </section>
          <p className={styles.requiredCount}>Required sections: {requiredSections.length}</p>
        </>
      ) : null}
    </div>
  );
}
