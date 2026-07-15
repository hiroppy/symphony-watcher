const STATUS_LABELS = {
  started: "🟢 Started",
  updated: "🔵 Updated",
  retrying: "🟠 Retrying",
  blocked: "🔴 Blocked",
  ended: "✅ Ended",
};

const STATUS_COLORS = {
  started: "#06B6D4",
  updated: "#3B82F6",
  retrying: "#F59E0B",
  blocked: "#EF4444",
  ended: "#6B7280",
};

const REVIEW_COLOR = "#22C55E";
const DONE_COLOR = "#8B5CF6";

export function buildSlackPayload(event) {
  const issueLabel = formatIssueLabel(event);
  const titleUrl = event.pullRequest?.url ?? event.issueUrl;
  const linkedIssue = titleUrl
    ? `<${titleUrl}|${escapeSlack(issueLabel)}>`
    : escapeSlack(issueLabel);
  const details = eventDetails(event, issueLabel);
  const blocks = [sectionBlock(`*${linkedIssue}*`)];

  if (details.length > 0) {
    blocks.push(sectionBlock(details.join("\n")));
  }

  return {
    text: `${statusLabel(event)} · [*${escapeSlack(event.service)}*]`,
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

function eventDetails(event, issueLabel) {
  const links = [
    event.pullRequest ? `*PR:* ${formatPullRequest(event.pullRequest)}` : null,
    event.issueUrl ? `*Linear:* <${event.issueUrl}|${escapeSlack(issueLabel)}>` : null,
  ];
  return [
    `*Event:* ${escapeSlack(eventLabel(event.type))}`,
    event.activity && event.type !== "ended" ? `*Activity:* ${escapeSlack(event.activity)}` : null,
    ...links,
    event.attempt ? `*Attempt:* ${event.attempt}` : null,
    event.dueAt ? `*Due:* ${escapeSlack(event.dueAt)}` : null,
    event.error ? `*Error:* ${escapeSlack(event.error)}` : null,
  ].filter(Boolean);
}

function formatIssueLabel(event) {
  return event.issueTitle ? `${event.issueIdentifier}: ${event.issueTitle}` : event.issueIdentifier;
}

function statusLabel(event) {
  const state = displayState(event);

  if (!state || String(event.issueIdentifier).startsWith("watcher:")) {
    return STATUS_LABELS[event.type] ?? event.type;
  }

  if (state.toLowerCase() === "in review") return `👀 ${state}`;
  if (event.resolvedStateType === "completed" || state.toLowerCase() === "done") return `✅ ${state}`;
  return `🔵 ${state}`;
}

function eventLabel(type) {
  const label = STATUS_LABELS[type] ?? type;
  return label.replace(/^\S+\s+/, "");
}

function statusColor(event) {
  if (isInReview(event)) return REVIEW_COLOR;
  if (event.resolvedStateType === "completed" || event.resolvedState?.toLowerCase() === "done") return DONE_COLOR;
  return STATUS_COLORS[event.type] ?? STATUS_COLORS.ended;
}

function displayState(event) {
  return event.resolvedState ?? event.state;
}

function isInReview(event) {
  return displayState(event)?.toLowerCase() === "in review";
}

function formatPullRequest(pullRequest) {
  const label = pullRequest.number ? `#${pullRequest.number}` : pullRequestLabelFromUrl(pullRequest.url);
  const metadata = [
    pullRequest.state,
    pullRequest.isDraft ? "draft" : null,
    pullRequest.reviewDecision ? humanizeReviewDecision(pullRequest.reviewDecision) : null,
  ].filter(Boolean);
  const suffix = metadata.length > 0 ? ` (${metadata.map(escapeSlack).join(", ")})` : "";

  return `<${pullRequest.url}|${escapeSlack(label)}>${suffix}`;
}

function pullRequestLabelFromUrl(url) {
  const match = String(url).match(/\/pull\/(\d+)(?:$|[/?#])/);
  return match ? `#${match[1]}` : url;
}

function humanizeReviewDecision(reviewDecision) {
  return String(reviewDecision).toLowerCase().replaceAll("_", " ");
}

function escapeSlack(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
