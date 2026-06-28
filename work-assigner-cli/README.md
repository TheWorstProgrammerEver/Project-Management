# Work Assigner CLI

The work assigner is the first local runner for autonomous Project Management work.

It deliberately does not browse or rank task lists itself. It calls the worker API action `claim_next_work_item`, and the database atomically selects one `ready` item ordered by `priority_rank asc, created_at asc`. That keeps duplicate top-level agents from taking the same task.

## Configuration

The CLI loads environment in this order:

1. `work-assigner-cli/.env.defaults` (checked in)
2. `work-assigner-cli/.env.local` (ignored, optional)
3. any `--env-file <path>` files
4. process environment
5. CLI flags

The checked-in file lists the local development defaults, including the local Supabase worker URL. That keeps machine-specific values out of the code path.

## Run Once

```sh
npm run work-assigner -- \
  --once \
  --backlog-id <backlog-id>
```

By default, a claimed task is handed to:

```sh
codex exec -
```

The claimed task prompt is piped to stdin. The child process also receives useful environment variables:

- `WORK_ASSIGNER_WORK_ITEM_ID`
- `WORK_ASSIGNER_WORK_ITEM_TITLE`
- `WORK_ASSIGNER_WORK_ITEM_JSON`
- `WORK_ASSIGNER_BACKLOG_ID`
- `WORK_ASSIGNER_LEASE_TOKEN`
- `WORK_ASSIGNER_LEASE_EXPIRES_AT`

## Loop

```sh
npm run work-assigner -- \
  --loop \
  --poll-seconds 60 \
  --backlog-id <backlog-id>
```

The first version intentionally supports only one active task per process:

```sh
--max-concurrent-tasks 1
```

Any value above `1` is rejected.

## Completion Behavior

- Child exits `0`: the CLI calls `complete_work_item`, which moves the item to `review`.
- Child exits non-zero: the CLI calls `fail_work_item`, which moves the item to `blocked`.
- No ready item: the CLI sleeps in loop mode or exits in once mode.
- Active child command: the CLI heartbeats the lease until the command exits.

Until task comments exist, the child command's final stdout becomes the item result summary or blocker summary.

## Local Safety

The CLI stores local lock and active-lease state under `.work-assigner/` by default.

If a previous local lease is found and its child process is gone, the CLI marks the item blocked before claiming new work. This avoids silently duplicating half-finished local work.

Use `--dry-run` to validate configuration without claiming:

```sh
npm run work-assigner -- --dry-run
```

For non-local environments, point the runner at a different file:

```sh
npm run work-assigner -- \
  --env-file /etc/project-management/work-assigner.env \
  --loop
```
