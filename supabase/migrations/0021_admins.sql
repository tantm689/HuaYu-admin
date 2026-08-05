-- CRITICAL fix: the Admin app and the User app share one Supabase project
-- (same NEXT_PUBLIC_SUPABASE_URL in both repos' .env.local), and until now
-- neither the page middleware (lib/supabase/middleware.ts) nor the API
-- route guard (lib/supabase/requireAdmin.ts) checked anything beyond "is
-- this a logged-in user" - any account that could sign in to the User app
-- could also sign in to the Admin app and reach every admin page/route.
--
-- This table is the allowlist: a user must have a row here to pass
-- requireAdmin()/the page middleware's admin check. No self-service sign-up
-- path exists or should ever exist for this table - rows are added by an
-- existing admin running SQL directly in the Supabase SQL editor.
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;

-- No policies for the `anon`/`authenticated` roles: with RLS enabled and no
-- policy, PostgREST denies all access by default. The admin app's own
-- server-side checks use SUPABASE_SERVICE_ROLE_KEY (see
-- lib/supabase/server.ts), which bypasses RLS entirely, so this table being
-- fully locked down to PostgREST does not affect the app's own ability to
-- read it - it only prevents the public anon key from reading or writing
-- the admin allowlist directly.
