import type {
  HumanPathContactSuggestion,
  OutreachMessageRecord,
  Pursuit,
} from "./types";
import type { PursuitBucket } from "./tracking";

export type ApplyWizardResumeStep = 1 | 2 | 3 | 4;

export type ApplyWizardResumeState = {
  mode: "stepper" | "applied";
  step: ApplyWizardResumeStep;
  reached: ApplyWizardResumeStep;
  selectedContactIds: string[];
  outreachNeedsRetry: boolean;
};

type ResumeInput = {
  bucket: PursuitBucket;
  pursuit: Pick<Pursuit, "status">;
  contacts: Array<Pick<HumanPathContactSuggestion, "id" | "selectedForOutreach">>;
  outreachMessages: Array<Pick<OutreachMessageRecord, "contactSuggestionId">>;
};

export function deriveApplyWizardResumeState(input: ResumeInput): ApplyWizardResumeState {
  const selectedContactIds = input.contacts
    .filter((contact) => contact.selectedForOutreach)
    .map((contact) => contact.id);

  if (input.bucket === "applied") {
    return {
      mode: "applied",
      step: 4,
      reached: 4,
      selectedContactIds,
      outreachNeedsRetry: false,
    };
  }

  let step: ApplyWizardResumeStep;
  let outreachNeedsRetry = false;
  switch (input.pursuit.status) {
    case "discovered":
    case "saved":
      step = 1;
      break;
    case "review_complete":
    case "human_path_generated":
      step = 2;
      break;
    case "outreach_ready": {
      const draftedContactIds = new Set(
        input.outreachMessages
          .map((message) => message.contactSuggestionId)
          .filter((id): id is string => Boolean(id)),
      );
      const missingSelectedDraft = selectedContactIds.some((id) => !draftedContactIds.has(id));
      if (input.outreachMessages.length === 0 && selectedContactIds.length === 0) {
        step = 2;
      } else if (missingSelectedDraft || input.outreachMessages.length === 0) {
        step = 3;
        outreachNeedsRetry = true;
      } else {
        step = 4;
      }
      break;
    }
    default:
      step = 4;
      break;
  }

  return {
    mode: "stepper",
    step,
    reached: step,
    selectedContactIds,
    outreachNeedsRetry,
  };
}
