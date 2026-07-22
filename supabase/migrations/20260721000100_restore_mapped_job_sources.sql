-- Restore the canonical broad-market source map. Targeted company boards from the retired
-- private scanner are intentionally excluded because they came from one user's personal
-- watchlist and must not become defaults for every user. Idempotent and pause-preserving: an
-- existing global row wins, including an intentionally paused row. User-owned rows never block
-- a global seed with the same board URL.

with query_variants(variant) as (
  values
    ('ai enablement'),
    ('brand operations'),
    ('creative operations'),
    ('creative operations director'),
    ('creative producer'),
    ('creative program manager'),
    ('delivery lead'),
    ('design program manager'),
    ('director of production'),
    ('executive producer'),
    ('head of production'),
    ('launch operations'),
    ('product operations'),
    ('production operations'),
    ('program director'),
    ('senior executive producer'),
    ('senior producer'),
    ('senior program manager'),
    ('strategic operations'),
    ('studio operations')
),
generated_sources as (
  select
    'Himalayas Broad Job Board - ' || initcap(variant) as company_name,
    'https://himalayas.app'::text as website_url,
    'https://himalayas.app/jobs/api/search?q=' || replace(variant, ' ', '%20') || '&sort=recent&page=1' as careers_url,
    'html'::text as ats_provider,
    ''::text as ats_board_token,
    'active'::text as status,
    '{}'::text[] as workday_variants,
    null::text as last_error
  from query_variants
  union all
  select
    'Workable Broad Job Board - ' || initcap(variant),
    'https://jobs.workable.com',
    'https://jobs.workable.com/api/v1/jobs?query=' || replace(variant, ' ', '%20') || '&workplace=remote&location=United+States',
    'html', '', 'active', '{}'::text[], null::text
  from query_variants
  union all
  select
    'Adzuna Broad Job Board - ' || initcap(variant),
    'https://www.adzuna.com',
    'https://api.adzuna.com/v1/api/jobs/us/search/1?title_only=' || replace(variant, ' ', '%20') || '&what_and=remote&results_per_page=25&sort_by=date&max_days_old=30',
    'html', '', 'active', '{}'::text[], null::text
  from query_variants
),
fixed_sources(company_name, website_url, careers_url, ats_provider, ats_board_token, status, workday_variants, last_error) as (
  values
    ('Remotive Broad Job Board - Ai Enablement', 'https://remotive.com', 'https://remotive.com/api/remote-jobs?search=ai%20enablement', 'html', '', 'active', '{}'::text[], null::text),
    ('Remotive Broad Job Board - Creative Operations', 'https://remotive.com', 'https://remotive.com/api/remote-jobs?search=creative%20operations', 'html', '', 'active', '{}'::text[], null::text),
    ('Remotive Broad Job Board - Producer', 'https://remotive.com', 'https://remotive.com/api/remote-jobs?search=producer', 'html', '', 'active', '{}'::text[], null::text),
    ('Remotive Broad Job Board - Program Director', 'https://remotive.com', 'https://remotive.com/api/remote-jobs?search=program%20director', 'html', '', 'active', '{}'::text[], null::text),
    ('We Work Remotely RSS - Management & Finance', 'https://weworkremotely.com', 'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss', 'html', '', 'active', '{}'::text[], null::text),
    ('We Work Remotely RSS - Product', 'https://weworkremotely.com', 'https://weworkremotely.com/categories/remote-product-jobs.rss', 'html', '', 'active', '{}'::text[], null::text),
    ('Arbeitnow Broad Job Board', 'https://arbeitnow.com', 'https://arbeitnow.com/api/job-board-api', 'html', '', 'active', '{}'::text[], null::text),
    ('Remote OK Broad Job Board', 'https://remoteok.com', 'https://remoteok.com/api', 'html', '', 'active', '{}'::text[], null::text),
    ('Magnit Direct Sourcing', 'https://magnitglobal.com', 'https://directsource.magnitglobal.com/us/magnitds/jobs', 'magnit', 'us/magnitds', 'active', '{}'::text[], null::text)
),
seed_sources as (
  select * from generated_sources
  union all select * from fixed_sources
)
insert into public.job_sources (
  company_name,
  website_url,
  careers_url,
  ats_provider,
  ats_board_token,
  status,
  workday_variants,
  last_error,
  owner_user_id
)
select
  seed.company_name,
  seed.website_url,
  seed.careers_url,
  seed.ats_provider,
  seed.ats_board_token,
  seed.status,
  seed.workday_variants,
  seed.last_error,
  null
from seed_sources seed
where not exists (
  select 1
  from public.job_sources existing
  where existing.owner_user_id is null
    and existing.ats_provider = seed.ats_provider
    and (
      (seed.ats_board_token <> '' and existing.ats_board_token = seed.ats_board_token)
      or
      (seed.ats_board_token = '' and existing.careers_url = seed.careers_url)
    )
)
on conflict do nothing;
