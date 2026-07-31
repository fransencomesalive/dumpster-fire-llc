// Shared disposable-profile seed for production QA harnesses.
//
// Callers inject a service-role REST helper so this module stays free of
// credentials and both browser journeys exercise the same complete-profile
// fixture without depending on the rotating Supabase Management API token.

export function createRestProfileSeeder({ rest }) {
  if (typeof rest !== "function") {
    throw new TypeError("createRestProfileSeeder requires a REST helper");
  }

  return async function seedCompleteProfile({
    userId,
    email,
    profileId,
    roleTrackId,
    resumeId,
    workExampleId,
    skillId,
  }) {
    const now = new Date().toISOString();
    await rest("candidate_profiles", { method: "POST", body: {
      id: profileId,
      user_id: userId,
      status: "complete",
      full_name: "Production Scan QA",
      preferred_name: "QA",
      location: "Denver, CO",
      email,
      remote_preference: "remote_preferred",
      target_compensation_min: 90000,
      target_compensation_preferred: 150000,
      generated_markdown: "# Production Scan QA",
      markdown_generated_at: now,
    } }, "Candidate profile seed");
    await rest("candidate_profile_preferences", { method: "POST", body: {
      profile_id: profileId,
      employment_types: ["full_time", "contract"],
      target_industries: ["technology", "consumer"],
      avoid_industries: [],
      avoid_companies: [],
    } }, "Preferences seed");
    await rest("role_tracks", { method: "POST", body: {
      id: roleTrackId,
      profile_id: profileId,
      name: "Marketing Leadership",
      description: "Senior marketing and creative leadership.",
      core_positioning: "Builds practical marketing systems and teams.",
      outreach_angle: "Lead with cross-functional marketing delivery.",
      target_titles: [
        "Director of Marketing",
        "Creative Director",
        "Director of Content",
        "Marketing Program Manager",
      ],
      key_responsibilities: ["Lead marketing strategy", "Manage creative delivery"],
      required_experience_patterns: ["Cross-functional leadership"],
      strong_job_signals: ["Brand", "Content", "Creative"],
      weak_job_signals: [],
      mismatch_signals: ["Entry level"],
    } }, "Role track seed");
    await rest("resumes", { method: "POST", body: {
      id: resumeId,
      profile_id: profileId,
      name: "Production QA resume",
      file_url: "",
      parsed_text: "Marketing leader with extensive brand, content, creative operations, campaign, and cross-functional program experience.",
      highlights: ["Led integrated marketing programs"],
      strengths: ["Marketing leadership", "Creative operations"],
      gaps: [],
      use_when: ["Marketing leadership roles"],
      avoid_when: [],
      parsing_quality: "complete",
      parsing_issues: [],
    } }, "Resume seed");
    await rest("resume_role_tracks", { method: "POST", body: {
      resume_id: resumeId,
      role_track_id: roleTrackId,
    } }, "Resume track seed");
    await rest("work_examples", { method: "POST", body: {
      id: workExampleId,
      profile_id: profileId,
      title: "Integrated campaign",
      one_hitter: "Led a cross-functional campaign from strategy through launch.",
      context: "Aligned brand, content, creative, and delivery teams around a measurable launch plan.",
    } }, "Work example seed");
    await rest("skill_profiles", { method: "POST", body: {
      id: skillId,
      profile_id: profileId,
      skill_name: "Marketing leadership",
      proficiency: "expert",
      evidence: ["Led integrated marketing and creative teams"],
    } }, "Skill seed");
    await rest("skill_work_examples", { method: "POST", body: {
      skill_id: skillId,
      work_example_id: workExampleId,
    } }, "Skill example seed");
    await rest("voice_personality", { method: "POST", body: {
      profile_id: profileId,
      q1_value: "Turning fuzzy marketing plans into work teams can ship.",
      q4_opinion: "Clear strategy matters only when a team can execute it.",
      tone_tags: ["direct", "warm", "specific"],
      avoid_tags: ["corporate jargon"],
      avoid_note: "Avoid generic claims.",
    } }, "Voice seed");
    await rest("writing_samples", { method: "POST", body: [{
      profile_id: profileId,
      bucket: "sounds_like_me",
      channel: "email",
      text: "I like clear plans, honest tradeoffs, and work that gets shipped.",
      tags: ["direct"],
    }, {
      profile_id: profileId,
      bucket: "never_sound",
      channel: "email",
      text: "I am thrilled to leverage synergies and unlock exceptional value.",
      tags: ["corporate"],
    }] }, "Writing samples seed");
    await rest("profile_quality", { method: "POST", body: {
      profile_id: profileId,
      status: "complete",
      incomplete_reasons: [],
      weak_fields: [],
      complete_fields: ["production_browser_qa"],
      weak_response_count: 0,
      last_checked_at: now,
    } }, "Profile quality seed");
    const plans = await rest(
      "subscription_plans?name=eq.premium&select=id&limit=1",
      {},
      "Premium plan lookup",
    );
    if (typeof plans?.[0]?.id !== "string") {
      throw new Error("Premium plan was not found");
    }
    await rest("user_subscriptions", { method: "POST", body: {
      user_id: userId,
      plan_id: plans[0].id,
      status: "active",
      source: "access_code",
    } }, "Subscription seed");
  };
}
