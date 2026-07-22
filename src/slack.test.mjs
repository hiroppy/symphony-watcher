import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSlackPayload } from "./slack.mjs";

describe("buildSlackPayload", () => {
  it("uses a neutral label when the Linear state is unavailable", () => {
    const cases = [
      [{ type: "started" }, "❔ Unknown"],
      [{ type: "updated" }, "❔ Unknown"],
      [{ type: "retrying", state: "unavailable" }, "⚠️ unavailable"],
      [{ type: "blocked" }, "❔ Unknown"],
      [{ type: "ended" }, "❔ Unknown"],
      [{ type: "ended", resolvedState: "Done" }, "✅ Done"],
      [{ type: "ended", resolvedState: "In Review" }, "👀 In Review"],
    ];

    for (const [status, expected] of cases) {
      const payload = buildSlackPayload({
        service: "serviceA",
        issueIdentifier: "ENG-62",
        ...status,
      });

      assert.equal(payload.text, `${expected} · [*serviceA*]`);
    }
  });

  it("uses the current Linear state as the primary status", () => {
    const cases = [
      [{ type: "started", state: "Backlog" }, "📥 Backlog"],
      [{ type: "started", state: "Todo" }, "📋 Todo"],
      [{ type: "started", state: "In Progress" }, "🚧 In Progress"],
      [{ type: "started", state: "Rework" }, "🔄 Rework"],
      [{ type: "updated", resolvedState: "In Review" }, "👀 In Review"],
      [{ type: "ended", resolvedState: "Done" }, "✅ Done"],
      [{ type: "ended", resolvedState: "Canceled" }, "🚫 Canceled"],
      [{ type: "updated", resolvedState: "QA" }, "❔ QA"],
      [{ type: "updated", state: "Custom state" }, "❔ Custom state"],
    ];

    for (const [status, expected] of cases) {
      const payload = buildSlackPayload({
        ...status,
        service: "serviceA",
        issueIdentifier: "ENG-62",
      });

      assert.equal(payload.text, `${expected} · [*serviceA*]`);
    }
  });

  it("mentions the configured reviewer only for in review notifications", () => {
    const inReview = buildSlackPayload(
      {
        type: "ended",
        service: "serviceA",
        issueIdentifier: "ENG-62",
        resolvedState: "In Review",
      },
      { inReviewMention: "<!subteam^S012AB3CD>" },
    );
    const inProgress = buildSlackPayload(
      {
        type: "started",
        service: "serviceA",
        issueIdentifier: "ENG-62",
        resolvedState: "In Progress",
      },
      { inReviewMention: "<!subteam^S012AB3CD>" },
    );

    assert.equal(inReview.text, "👀 In Review · [*serviceA*] <!subteam^S012AB3CD>");
    assert.equal(inProgress.text, "🚧 In Progress · [*serviceA*]");
  });

  it("uses Linear state colors and a neutral fallback", () => {
    const cases = [
      [{ type: "started" }, "#6B7280"],
      [{ type: "updated" }, "#6B7280"],
      [{ type: "retrying" }, "#6B7280"],
      [{ type: "blocked" }, "#6B7280"],
      [{ type: "ended" }, "#6B7280"],
      [{ type: "started", state: "Backlog" }, "#64748B"],
      [{ type: "started", state: "Todo" }, "#94A3B8"],
      [{ type: "started", state: "In Progress" }, "#D88A2D"],
      [{ type: "started", state: "Rework" }, "#F7C8C1"],
      [{ type: "updated", state: "In Progress" }, "#D88A2D"],
      [{ type: "blocked", state: "In Progress" }, "#D88A2D"],
      [{ type: "ended", resolvedState: "Done" }, "#8B5CF6"],
      [{ type: "ended", resolvedState: "Released" }, "#6B7280"],
      [{ type: "ended", resolvedState: "In Review" }, "#22C55E"],
      [{ type: "retrying", state: "unavailable", issueIdentifier: "watcher:serviceA" }, "#F59E0B"],
    ];

    for (const [status, expected] of cases) {
      const payload = buildSlackPayload({
        service: "serviceA",
        issueIdentifier: "ENG-62",
        ...status,
      });

      assert.equal(payload.attachments[0].color, expected);
    }
  });

  it("formats concise event details for Slack incoming webhooks", () => {
    const payload = buildSlackPayload({
      type: "blocked",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      issueTitle: "Show Linear titles in Slack",
      issueUrl: "https://linear.app/example/issue/ENG-62/example",
      pullRequest: {
        url: "https://github.com/example/example-service/pull/123",
        state: "OPEN",
        isDraft: false,
        reviewDecision: "REVIEW_REQUIRED",
      },
      state: "In Progress",
      activity: "running tests",
    });

    assert.equal(payload.text, "🚧 In Progress · [*serviceA*]");
    assert.equal(payload.attachments[0].color, "#D88A2D");
    assert.deepEqual(payload.attachments[0].blocks[0], {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*<https://github.com/example/example-service/pull/123|ENG-62: Show Linear titles in Slack>*",
      },
    });
    assert.equal(
      payload.attachments[0].blocks[1].text.text,
      [
        "<https://github.com/example/example-service/pull/123|PR#123>(OPEN, review required) | <https://linear.app/example/issue/ENG-62/example|Linear#ENG-62>",
        "",
        "*Event:* Blocked",
        "*Activity:* running tests",
      ].join("\n"),
    );
    assert.ok(!payload.attachments[0].blocks[1].text.text.includes("Message:"));
    assert.ok(!payload.attachments[0].blocks[1].text.text.includes("At:"));
    assert.ok(!payload.attachments[0].blocks[1].text.text.includes("Workspace:"));
  });

  it("uses resolved Linear state for ended events", () => {
    const payload = buildSlackPayload({
      type: "ended",
      service: "worker-service",
      issueIdentifier: "ENG-65",
      issueUrl: "https://linear.app/example/issue/ENG-65/example",
      state: "In Progress",
      resolvedState: "In Review",
      activity: "command execution started",
    });

    assert.equal(payload.text, "👀 In Review · [*worker-service*]");
    assert.equal(payload.attachments[0].color, "#22C55E");
    assert.deepEqual(payload.attachments[0].blocks, [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*<https://linear.app/example/issue/ENG-65/example|ENG-65>*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "<https://linear.app/example/issue/ENG-65/example|Linear#ENG-65>",
            "",
            "*Event:* Ended",
          ].join("\n"),
        },
      },
    ]);
  });

  it("puts the pull request before Linear in review notifications", () => {
    const payload = buildSlackPayload({
      type: "ended",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      issueTitle: "Show Linear titles in Slack",
      issueUrl: "https://linear.app/example/issue/ENG-62/example",
      resolvedState: "In Review",
      pullRequest: {
        url: "https://github.com/example/example-service/pull/123",
        number: 123,
        state: "OPEN",
        reviewDecision: "REVIEW_REQUIRED",
      },
    });

    assert.equal(payload.text, "👀 In Review · [*serviceA*]");
    assert.equal(
      payload.attachments[0].blocks[0].text.text,
      "*<https://github.com/example/example-service/pull/123|ENG-62: Show Linear titles in Slack>*",
    );
    assert.equal(
      payload.attachments[0].blocks[1].text.text,
      [
        "<https://github.com/example/example-service/pull/123|PR#123>(OPEN, review required) | <https://linear.app/example/issue/ENG-62/example|Linear#ENG-62>",
        "",
        "*Event:* Ended",
      ].join("\n"),
    );
  });

  it("shows runtime, turns, and tokens only for ended or in-review notifications", () => {
    const now = new Date("2026-06-12T06:48:00Z");
    const metrics = {
      startedAt: "2026-06-12T05:30:00Z",
      turnCount: 7,
      tokens: { total: 42_300 },
    };
    const ended = buildSlackPayload({
      type: "ended",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      ...metrics,
    }, { now });
    const inReview = buildSlackPayload({
      type: "updated",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      resolvedState: "In Review",
      ...metrics,
    }, { now });
    const started = buildSlackPayload({
      type: "started",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      ...metrics,
    }, { now });

    const expected = "*Runtime:* 1h 18m · *Turns:* 7 · *Tokens:* 42.3k";
    assert.ok(ended.attachments[0].blocks[1].text.text.includes(expected));
    assert.ok(inReview.attachments[0].blocks[1].text.text.includes(expected));
    assert.ok(!started.attachments[0].blocks[1].text.text.includes("Runtime"));
  });

  it("shows blocked duration and relative retry delay", () => {
    const now = new Date("2026-06-12T06:48:00Z");
    const blocked = buildSlackPayload({
      type: "blocked",
      service: "serviceA",
      issueIdentifier: "ENG-62",
      blockedAt: "2026-06-12T06:36:00Z",
    }, { now });
    const retrying = buildSlackPayload({
      type: "retrying",
      service: "serviceA",
      issueIdentifier: "ENG-63",
      dueAt: "2026-06-12T06:48:30Z",
    }, { now });

    assert.ok(blocked.attachments[0].blocks[1].text.text.includes("*Blocked for:* 12m"));
    assert.ok(retrying.attachments[0].blocks[1].text.text.includes("*Retry in:* 30s"));
  });
});
