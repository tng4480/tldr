create extension if not exists "pgcrypto";

create schema if not exists next_auth;

-- NextAuth / Auth.js tables (expected by @auth/supabase-adapter)
create table if not exists next_auth.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  "emailVerified" timestamptz,
  image text,
  created_at timestamptz default now()
);

create table if not exists next_auth.accounts (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references next_auth.users(id) on delete cascade,
  type text,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  oauth_token_secret text,
  oauth_token text,
  unique(provider, "providerAccountId")
);

create table if not exists next_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  "sessionToken" text not null unique,
  "userId" uuid not null references next_auth.users(id) on delete cascade,
  expires timestamptz not null
);

create table if not exists next_auth.verification_tokens (
  id bigint generated always as identity primary key,
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  unique (identifier, token)
);

create table if not exists public.user_profiles (
  id uuid primary key references next_auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  monthly_usage integer not null default 0,
  monthly_limit integer not null default 20,
  monthly_usage_period text not null default '',
  trial_active boolean not null default true,
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references next_auth.users(id) on delete cascade,
  event_type text not null default 'simplify',
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz default now()
);

create table if not exists public.cached_simplifications (
  content_hash text primary key,
  reading_level text not null,
  simplified_text text not null,
  model text,
  created_at timestamptz default now()
);

create table if not exists public.extension_tokens (
  token_hash text primary key,
  user_id uuid references next_auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists usage_events_user_id_created_at_idx
  on public.usage_events (user_id, created_at);

create index if not exists extension_tokens_user_id_idx
  on public.extension_tokens (user_id);

create index if not exists user_profiles_stripe_customer_id_idx
  on public.user_profiles (stripe_customer_id);

create index if not exists user_profiles_stripe_subscription_id_idx
  on public.user_profiles (stripe_subscription_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();
