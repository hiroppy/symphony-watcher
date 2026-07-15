# Orchestrator Slack Watcher

Polls orchestrator observability endpoints and posts state changes to Slack without modifying the source services.
Slack messages include the Linear issue title and URL when `LINEAR_API_KEY` is configured. When the event has a `workspace_path`, the watcher also
tries `gh pr view` in that workspace and includes the current branch PR URL when available.

## Usage

Requires Node.js 24. With a version manager that supports `.node-version`, the repository version
is selected automatically.

```bash
cp config.example.json config.json
# Edit config.json with your settings and credentials.
npm start -- --once --dry-run
npm start
```

`--dry-run` prints the Slack payload instead of posting. `--once` runs one polling cycle and exits.
Keep `config.json` private because it contains credentials; it is excluded by `.gitignore`.
`SLACK_WEBHOOK_URL` and `LINEAR_API_KEY` environment variables can override the corresponding
config values when needed.

## Events

- `started`: an issue appears in `running`
- `updated`: a running issue changes tracker status while staying in `running`
- `retrying`: an issue appears in or changes retry state
- `blocked`: an issue appears in or changes blocked state
- `ended`: an issue disappears from `running`; when `LINEAR_API_KEY` is configured, the watcher
  resolves the current Linear state and labels the Slack message with that state instead

Without `LINEAR_API_KEY`, `ended` only means the issue is no longer running in the orchestrator's current
snapshot. With `LINEAR_API_KEY`, the watcher fetches the current Linear state by issue identifier and
uses that state in Slack, for example `In Review` or `Done`.

## Slack message fields

The notification body intentionally stays compact:

- `State`
- `Linear` issue identifier and title
- `PR` when `gh pr view` can resolve one
- `Attempt`, `Due`, and `Error` for retry/blocked events

Low-level Codex fields such as message IDs, event names, timestamps, and workspace paths are omitted.
Notifications use a status-colored accent with the status and project on the first line. Started
is cyan, In Review is green, Updated is blue, Retrying is orange, Blocked is red, Done is purple, and an
unresolved Ended event is gray. The pull request is shown before the Linear link so the next action is easy to find. The issue title links directly
to the pull request when one is available, and falls back to Linear otherwise. Statuses use concise
emoji labels such as `🟢 Started`, `👀 In Review`, `🔴 Blocked`, `🟠 Retrying`, and `✅ Done`.

The watcher posts at most once for the same service, issue, and status. Activity changes inside the
same status update `state.json` but do not create new Slack messages. A new Slack message is
created when the issue enters another status, such as `Todo` -> `In Progress`, `running` -> `blocked`,
or `running` -> `ended`.
