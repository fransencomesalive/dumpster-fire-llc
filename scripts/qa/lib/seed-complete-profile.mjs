// Shared disposable-profile seed for the production QA harnesses.
//
// Extracted from scripts/qa/production-scan-browser.mjs (Randall, 2026-07-28) so
// the auth/header harness can assert the complete-profile case with the SAME
// fidelity. A shallow "status = complete" insert is not enough: the quality
// checker recomputes completeness from the underlying rows and correctly reports
// incomplete, which made the Job scan assertion fail for the wrong reason.
//
// Callers inject managementQuery + sqlLiteral so this module stays free of
// credentials and transport concerns.

export function createProfileSeeder({ managementQuery, sqlLiteral }) {
  return async function seedCompleteProfile({
    userId,
    email,
    profileId,
    roleTrackId,
    resumeId,
    workExampleId,
    skillId,
  }) {
    await managementQuery(`
      insert into public.candidate_profiles (
        id, user_id, status, full_name, preferred_name, location, email,
        remote_preference, target_compensation_min, target_compensation_preferred,
        generated_markdown, markdown_generated_at
      ) values (
        ${sqlLiteral(profileId)}::uuid,
        ${sqlLiteral(userId)}::uuid,
        'complete',
        'Production Scan QA',
        'QA',
        'Denver, CO',
        ${sqlLiteral(email)},
        'remote_preferred',
        90000,
        150000,
        '# Production Scan QA',
        clock_timestamp()
      );

      insert into public.candidate_profile_preferences (
        profile_id, employment_types, target_industries, avoid_industries, avoid_companies
      ) values (
        ${sqlLiteral(profileId)}::uuid,
        array['full_time', 'contract'],
        array['technology', 'consumer'],
        array[]::text[],
        array[]::text[]
      );

      insert into public.role_tracks (
        id, profile_id, name, description, core_positioning, outreach_angle,
        target_titles, key_responsibilities, required_experience_patterns,
        strong_job_signals, weak_job_signals, mismatch_signals
      ) values (
        ${sqlLiteral(roleTrackId)}::uuid,
        ${sqlLiteral(profileId)}::uuid,
        'Marketing Leadership',
        'Senior marketing and creative leadership.',
        'Builds practical marketing systems and teams.',
        'Lead with cross-functional marketing delivery.',
        array[
          'Director of Marketing',
          'Creative Director',
          'Director of Content',
          'Marketing Program Manager'
        ],
        array['Lead marketing strategy', 'Manage creative delivery'],
        array['Cross-functional leadership'],
        array['Brand', 'Content', 'Creative'],
        array[]::text[],
        array['Entry level']
      );

      insert into public.resumes (
        id, profile_id, name, file_url, parsed_text, highlights, strengths, gaps,
        use_when, avoid_when, parsing_quality, parsing_issues
      ) values (
        ${sqlLiteral(resumeId)}::uuid,
        ${sqlLiteral(profileId)}::uuid,
        'Production QA resume',
        '',
        'Marketing leader with extensive brand, content, creative operations, campaign, and cross-functional program experience.',
        array['Led integrated marketing programs'],
        array['Marketing leadership', 'Creative operations'],
        array[]::text[],
        array['Marketing leadership roles'],
        array[]::text[],
        'complete',
        array[]::text[]
      );

      insert into public.resume_role_tracks (resume_id, role_track_id)
      values (${sqlLiteral(resumeId)}::uuid, ${sqlLiteral(roleTrackId)}::uuid);

      insert into public.work_examples (id, profile_id, title, one_hitter, context)
      values (
        ${sqlLiteral(workExampleId)}::uuid,
        ${sqlLiteral(profileId)}::uuid,
        'Integrated campaign',
        'Led a cross-functional campaign from strategy through launch.',
        'Aligned brand, content, creative, and delivery teams around a measurable launch plan.'
      );

      insert into public.skill_profiles (id, profile_id, skill_name, proficiency, evidence)
      values (
        ${sqlLiteral(skillId)}::uuid,
        ${sqlLiteral(profileId)}::uuid,
        'Marketing leadership',
        'expert',
        array['Led integrated marketing and creative teams']
      );

      insert into public.skill_work_examples (skill_id, work_example_id)
      values (${sqlLiteral(skillId)}::uuid, ${sqlLiteral(workExampleId)}::uuid);

      insert into public.voice_personality (
        profile_id, q1_value, q4_opinion, tone_tags, avoid_tags, avoid_note
      ) values (
        ${sqlLiteral(profileId)}::uuid,
        'Turning fuzzy marketing plans into work teams can ship.',
        'Clear strategy matters only when a team can execute it.',
        array['direct', 'warm', 'specific'],
        array['corporate jargon'],
        'Avoid generic claims.'
      );

      insert into public.writing_samples (profile_id, bucket, channel, text, tags)
      values
        (
          ${sqlLiteral(profileId)}::uuid,
          'sounds_like_me',
          'email',
          'I like clear plans, honest tradeoffs, and work that gets shipped.',
          array['direct']
        ),
        (
          ${sqlLiteral(profileId)}::uuid,
          'never_sound',
          'email',
          'I am thrilled to leverage synergies and unlock exceptional value.',
          array['corporate']
        );

      insert into public.profile_quality (
        profile_id, status, incomplete_reasons, weak_fields, complete_fields,
        weak_response_count, last_checked_at
      ) values (
        ${sqlLiteral(profileId)}::uuid,
        'complete',
        array[]::text[],
        array[]::text[],
        array['production_browser_qa'],
        0,
        clock_timestamp()
      );

      insert into public.user_subscriptions (user_id, plan_id, status, source)
      select
        ${sqlLiteral(userId)}::uuid,
        id,
        'active',
        'access_code'
      from public.subscription_plans
      where name = 'premium'
      limit 1;
    `, "Disposable complete profile seed");
  }
}
