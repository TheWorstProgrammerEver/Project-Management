# Supabase

Project Management uses Supabase for authentication, local development services, and Edge Functions. Product tables and Row Level Security policies will be added with the first persisted app feature.

## Local Commands

Run the stack:

```sh
npm run supabase:start
```

Inspect local URLs and keys:

```sh
npm run supabase:status
```

Reset the local database from migrations:

```sh
npm run supabase:reset
```

Generate a migration from changes made in the local Supabase UI:

```sh
npm run supabase:migration -- add_some_change
```

This runs `supabase db diff --local --file add_some_change` and writes a timestamped migration under `supabase/migrations`.

Serve Edge Functions locally:

```sh
npm run supabase:functions:serve
```

The `app-health` function is public locally and should respond at:

```txt
http://127.0.0.1:54321/functions/v1/app-health
```

Stop the stack:

```sh
npm run supabase:stop
```

## Shape

Current split:

- Supabase Auth owns sign-in, sign-up, OTP, and magic-link flows.
- `app-health` is a public local health check for scripts and smoke tests.
- Product migrations, RLS policies, and command/query Edge Functions should be added once Project Management has its first persisted domain feature.
- Browser runtime configuration is loaded by `public/config.js` from JSON payloads. Local development uses generated, ignored `public/config.local.json`; deploys should substitute committed `public/config.json`.

## Environment Promotion

The React bundle should continue using runtime config rather than Vite build-time env vars:

- `#{SUPABASE_URL}#`
- `#{SUPABASE_PUBLISHABLE_KEY}#`
- `#{ENVIRONMENT}#`
- `#{BUILD_VERSION}#`
- `#{AUTH_EMAIL_PASSWORD_ENABLED}#`
- `#{AUTH_OTP_ENABLED}#`
- `#{AUTH_MAGIC_LINK_ENABLED}#`
- optionally `#{CONFIG_FILE}#` in `public/config.js` if a deploy needs to load a non-default JSON config path

That gives test and production the same build artifact with environment-specific values replaced at deployment time.
