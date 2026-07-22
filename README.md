# Orchestrator Slack Watcher

Polls orchestrator observability endpoints and posts state changes to Slack without modifying the source services.
Slack messages include the Linear issue title and URL when `LINEAR_API_KEY` is configured. The watcher also includes a GitHub pull request attached
to the Linear issue. When the event has a `workspace_path`, it first tries `gh pr view` in that workspace and uses the attached Linear resource as a fallback.

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

Set `inReviewMention` to a Slack member mention such as `<@U012AB3CD>` or a user group mention
such as `<!subteam^S012AB3CD>`. The watcher appends it only to notifications whose current Linear
state is `In Review`. Omit the setting to disable review mentions. Member IDs can be copied from a
Slack profile; user group IDs are available in the user group's Slack URL.

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

- `Event` (the watcher transition that triggered the notification)
- compact `PR#123 | Linear#ENG-62` links on one line when available
- `Attempt`, `Due`, and `Error` for retry/blocked events
- relative retry delay and blocked duration when Symphony provides the required timestamps
- `Runtime`, `Turns`, and `Tokens` for ended or `In Review` events

Low-level Codex fields such as message IDs, event names, timestamps, and workspace paths are omitted.
Notifications show the current Linear state and project on the first line. The watcher event that
triggered the notification, such as Started, Updated, or Ended, is shown separately in the body.
The first-line label and attachment accent represent the Linear state: Backlog is slate, Todo is gray, In Progress is orange,
Rework uses the Linear workflow's pale red, In Review is green, Done is purple, and Canceled is gray. This keeps the color stable across watcher
events, so Started, Updated, and Blocked notifications for `🚧 In Progress` are all orange. Watcher
events appear only in the `Event` detail. Service connection failures use `⚠️ Unavailable`, and a
missing state uses the neutral `❔ Unknown` fallback. The pull
request is shown before the Linear link so the next action is easy to find. The issue title links directly
to the pull request when one is available, and falls back to Linear otherwise. Linear states use distinct
emoji labels: `📥 Backlog`, `📋 Todo`, `🚧 In Progress`, `🔄 Rework`, `👀 In Review`, `✅ Done`, and
`🚫 Canceled`. Unknown states use `❔` and a neutral gray accent.

The watcher posts at most once for the same service, issue, and status. Activity changes inside the
same status update `state.json` but do not create new Slack messages. A new Slack message is
created when the issue enters another status, such as `Todo` -> `In Progress`, `running` -> `blocked`,
or `running` -> `ended`.
