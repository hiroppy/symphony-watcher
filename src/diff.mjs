const LIST_FIELDS = ["running", "retrying", "blocked"];

export function normalizeSnapshot(snapshot) {
  const normalized = {};

  for (const field of LIST_FIELDS) {
    normalized[field] = Array.isArray(snapshot?.[field]) ? snapshot[field] : [];
  }

  return normalized;
}

export function diffSnapshots(previousByService, currentByService, config) {
  const events = [];

  for (const service of config.services ?? []) {
    const serviceName = service.name;
    const previous = normalizeSnapshot(previousByService?.[serviceName]);
    const current = normalizeSnapshot(currentByService?.[serviceName]);
    const previousStatuses = statusIndex(previous);
    const currentStatuses = statusIndex(current);
    const linearBaseUrl = config.linearBaseUrl;

    events.push(...diffRunning(serviceName, previousStatuses, current.running, linearBaseUrl));
    events.push(...diffList(serviceName, previousStatuses, "retrying", current.retrying, linearBaseUrl));
    events.push(...diffList(serviceName, previousStatuses, "blocked", current.blocked, linearBaseUrl));
    events.push(...diffEnded(serviceName, previousStatuses, currentStatuses, linearBaseUrl));
  }

  return events;
}

function diffRunning(service, previousStatuses, currentRows, linearBaseUrl) {
  const events = [];

  for (const row of currentRows) {
    const issueIdentifier = issueIdentifierFor(row);
    if (!issueIdentifier) continue;

    const previousStatus = previousStatuses.get(issueIdentifier);
    const currentStatus = runningStatus(row);

    if (!previousStatus) {
      events.push(toEvent("started", service, row, linearBaseUrl));
      continue;
    }

    if (previousStatus.status !== currentStatus) {
      events.push(toEvent("updated", service, row, linearBaseUrl));
    }
  }

  return events;
}

function diffList(service, previousStatuses, type, currentRows, linearBaseUrl) {
  const events = [];

  for (const row of currentRows) {
    const issueIdentifier = issueIdentifierFor(row);
    if (!issueIdentifier) continue;

    if (previousStatuses.get(issueIdentifier)?.status !== type) {
      events.push(toEvent(type, service, row, linearBaseUrl));
    }
  }

  return events;
}

function diffEnded(service, previousStatuses, currentStatuses, linearBaseUrl) {
  const events = [];

  for (const [issueIdentifier, previousStatus] of previousStatuses.entries()) {
    if (!currentStatuses.has(issueIdentifier)) {
      events.push(toEvent("ended", service, previousStatus.row, linearBaseUrl));
    }
  }

  return events;
}

function statusIndex(snapshot) {
  const statuses = new Map();

  for (const row of snapshot.running) {
    const issueIdentifier = issueIdentifierFor(row);
    if (issueIdentifier) statuses.set(issueIdentifier, { status: runningStatus(row), row });
  }

  for (const row of snapshot.retrying) {
    const issueIdentifier = issueIdentifierFor(row);
    if (issueIdentifier) statuses.set(issueIdentifier, { status: "retrying", row });
  }

  for (const row of snapshot.blocked) {
    const issueIdentifier = issueIdentifierFor(row);
    if (issueIdentifier) statuses.set(issueIdentifier, { status: "blocked", row });
  }

  return statuses;
}

function runningStatus(row) {
  return row.state ?? "running";
}

function toEvent(type, service, row, linearBaseUrl) {
  const issueIdentifier = issueIdentifierFor(row);

  return compactObject({
    type,
    service,
    issueIdentifier,
    issueUrl: issueUrlFor(row, issueIdentifier, linearBaseUrl),
    state: row.state ?? null,
    message: row.last_message ?? row.error ?? null,
    activity: activityFor(row.last_message),
    workspacePath: row.workspace_path ?? null,
    startedAt: row.started_at ?? null,
    blockedAt: row.blocked_at ?? null,
    turnCount: row.turn_count ?? null,
    tokens: tokensFor(row.tokens),
    lastEvent: row.last_event ?? null,
    lastEventAt: row.last_event_at ?? row.blocked_at ?? row.due_at ?? null,
    attempt: row.attempt ?? null,
    dueAt: row.due_at ?? null,
    error: row.error ?? null,
  });
}

function tokensFor(tokens) {
  if (!tokens || typeof tokens !== "object") return null;

  const normalized = compactObject({
    input: tokens.input_tokens ?? tokens.inputTokens ?? null,
    output: tokens.output_tokens ?? tokens.outputTokens ?? null,
    total: tokens.total_tokens ?? tokens.totalTokens ?? null,
  });

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function issueIdentifierFor(row) {
  return row?.issue_identifier ?? row?.issueIdentifier ?? null;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));
}

function issueUrlFor(row, issueIdentifier, linearBaseUrl) {
  if (row.issue_url) return row.issue_url;
  if (!linearBaseUrl || !issueIdentifier || !/^[A-Z]+-\d+$/.test(issueIdentifier)) return null;
  return `${String(linearBaseUrl).replace(/\/$/, "")}/${encodeURIComponent(issueIdentifier)}`;
}

function activityFor(message) {
  if (!message) return null;

  const cleaned = String(message)
    .replaceAll(/\s+\((?:msg|call|rs)_[^)]+\)/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

  if (cleaned === "item started: command execution") return "command execution started";
  if (cleaned === "item completed: command execution") return "command execution completed";
  if (cleaned === "item started: agent message") return "agent response started";
  if (cleaned === "item completed: agent message") return null;

  return cleaned || null;
}
