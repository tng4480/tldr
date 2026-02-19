-- Convert user_profiles.plan from text to int2.
-- 0 = free, 1 = starter

begin;

alter table public.user_profiles
  add column if not exists plan_v2 int2;

update public.user_profiles
set plan_v2 = case
  when plan::text in ('starter', 'pro', '1') then 1
  else 0
end
where plan_v2 is null;

alter table public.user_profiles
  alter column plan_v2 set default 0,
  alter column plan_v2 set not null;

alter table public.user_profiles
  drop column if exists plan;

alter table public.user_profiles
  rename column plan_v2 to plan;

alter table public.user_profiles
  drop constraint if exists user_profiles_plan_check;

alter table public.user_profiles
  add constraint user_profiles_plan_check check (plan in (0, 1));

-- Keep monthly_limit consistent with mapped plan values.
update public.user_profiles
set monthly_limit = case when plan = 1 then 100 else 20 end;

commit;

-- Manual plan switch examples:
-- Free -> Starter for one user:
-- update public.user_profiles
-- set plan = 1, monthly_limit = 100
-- where id = '<user_uuid>';
--
-- Starter -> Free for one user:
-- update public.user_profiles
-- set plan = 0, monthly_limit = 20
-- where id = '<user_uuid>';
