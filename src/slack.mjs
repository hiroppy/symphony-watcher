const EVENT_LABELS = {
  started: "Started",
  updated: "Updated",
  retrying: "Retrying",
  blocked: "Blocked",
  ended: "Ended",
};

const DEFAULT_STATE_STYLE = { emoji: "❔", color: "#6B7280" };

const LINEAR_STATE_STYLES = {
  backlog: { emoji: "📥", color: "#64748B" },
  todo: { emoji: "📋", color: "#94A3B8" },
  "in progress": { emoji: "🚧", color: "#D88A2D" },
  "in review": { emoji: "👀", color: "#22C55E" },
  done: { emoji: "✅", color: "#8B5CF6" },
  canceled: { emoji: "🚫", color: "#6B7280" },
  cancelled: { emoji: "🚫", color: "#6B7280" },
  unavailable: { emoji: "⚠️", color: "#F59E0B" },
};

export function buildSlackPayload(event, { inReviewMention, now = new Date() } = {}) {
  const issueLabel = formatIssueLabel(event);
  const titleUrl = event.pullRequest?.url ?? event.issueUrl;
  const linkedIssue = titleUrl
    ? `<${titleUrl}|${escapeSlack(issueLabel)}>`
    : escapeSlack(issueLabel);
  const blocks = [
    sectionBlock(`*${linkedIssue}*`),
    sectionBlock(eventDetails(event, now).join("\n")),
  ];

  return {
    text: [
      `${statusLabel(event)} · [*${escapeSlack(event.service)}*]`,
      isInReview(event) ? inReviewMention : null,
    ].filter(Boolean).join(" "),
    attachments: [
      {
        color: statusColor(event),
        blocks,
      },
    ],
  };
}

function sectionBlock(text) {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text,
    },
  };
}

function eventDetails(event, now) {
  const links = [
    event.pullRequest ? formatPullRequest(event.pullRequest) : null,
    event.issueUrl ? `<${event.issueUrl}|Linear#${escapeSlack(event.issueIdentifier)}>` : null,
  ].filter(Boolean);
  const linkLine = links.join(" | ");
  const details = [
    `*Event:* ${escapeSlack(eventLabel(event.type))}`,
    event.activity && event.type !== "ended" ? `*Activity:* ${escapeSlack(event.activity)}` : null,
    event.attempt ? `*Attempt:* ${event.attempt}` : null,
    event.dueAt ? `*Due:* ${escapeSlack(event.dueAt)}` : null,
    retryInDetail(event, now),
    blockedForDetail(event, now),
    completionStatsDetail(event, now),
    event.error ? `*Error:* ${escapeSlack(event.error)}` : null,
  ].filter(Boolean);

  return linkLine ? [linkLine, "", ...details] : details;
}

function completionStatsDetail(event, now) {
  if (event.type !== "ended" && !isInReview(event)) return null;

  const stats = [
    durationBetween(event.startedAt, now, "Runtime"),
    positiveNumber(event.turnCount) ? `*Turns:* ${formatNumber(event.turnCount)}` : null,
    positiveNumber(event.tokens?.total) ? `*Tokens:* ${formatCompactNumber(event.tokens.total)}` : null,
  ].filter(Boolean);

  return stats.length > 0 ? stats.join(" · ") : null;
}

function blockedForDetail(event, now) {
  if (event.type !== "blocked") return null;
  return durationBetween(event.blockedAt, now, "Blocked for");
}

function retryInDetail(event, now) {
  if (event.type !== "retrying") return null;
  return durationBetween(now, event.dueAt, "Retry in");
}

function durationBetween(start, end, label) {
  const startMs = dateMilliseconds(start);
  const endMs = dateMilliseconds(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;

  return `*${label}:* ${formatDuration(Math.floor((endMs - startMs) / 1_000))}`;
}

function dateMilliseconds(value) {
  if (!value) return null;
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function formatNumber(value) {
  return Math.trunc(Number(value)).toLocaleString("en-US");
}

function formatCompactNumber(value) {
  const number = Number(value);
  if (number < 1_000) return formatNumber(number);
  if (number < 1_000_000) return `${stripTrailingZero((number / 1_000).toFixed(1))}k`;
  return `${stripTrailingZero((number / 1_000_000).toFixed(1))}m`;
}

function stripTrailingZero(value) {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

function formatIssueLabel(event) {
  return event.issueTitle ? `${event.issueIdentifier}: ${event.issueTitle}` : event.issueIdentifier;
}

function statusLabel(event) {
  const state = displayState(event);

  if (!state) return `${DEFAULT_STATE_STYLE.emoji} Unknown`;

  return `${stateStyle(state).emoji} ${state}`;
}

function eventLabel(type) {
  return EVENT_LABELS[type] ?? type;
}

function statusColor(event) {
  return stateStyle(displayState(event)).color;
}

function stateStyle(state) {
  const normalizedState = state?.trim().toLowerCase();

  return LINEAR_STATE_STYLES[normalizedState] ?? DEFAULT_STATE_STYLE;
}

function displayState(event) {
  return event.resolvedState ?? event.state;
}

function isInReview(event) {
  return displayState(event)?.toLowerCase() === "in review";
}

function formatPullRequest(pullRequest) {
  const number = pullRequest.number ?? pullRequestNumberFromUrl(pullRequest.url);
  const label = number ? `PR#${number}` : "PR";
  const metadata = [
    pullRequest.state,
    pullRequest.isDraft ? "draft" : null,
    pullRequest.reviewDecision ? humanizeReviewDecision(pullRequest.reviewDecision) : null,
  ].filter(Boolean);
  const suffix = metadata.length > 0 ? `(${metadata.map(escapeSlack).join(", ")})` : "";

  return `<${pullRequest.url}|${escapeSlack(label)}>${suffix}`;
}

function pullRequestNumberFromUrl(url) {
  const match = String(url).match(/\/pull\/(\d+)(?:$|[/?#])/);
  return match?.[1];
}

function humanizeReviewDecision(reviewDecision) {
  return String(reviewDecision).toLowerCase().replaceAll("_", " ");
}

function escapeSlack(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
