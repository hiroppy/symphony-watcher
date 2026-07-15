import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSlackPayload } from "./slack.mjs";

describe("buildSlackPayload", () => {
  it("uses an emoji label for every event status", () => {
    const cases = [
      [{ type: "started" }, "🟢 Started"],
      [{ type: "updated" }, "🔵 Updated"],
      [{ type: "retrying" }, "🟠 Retrying"],
      [{ type: "blocked" }, "🔴 Blocked"],
      [{ type: "ended" }, "✅ Ended"],
      [{ type: "ended", resolvedState: "Done" }, "✅ Done"],
      [{ type: "ended", resolvedState: "In Review" }, "👀 In Review"],
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

  it("uses the current Linear state as the primary status", () => {
    const cases = [
      [{ type: "started", state: "In Progress" }, "🔵 In Progress"],
      [{ type: "updated", resolvedState: "In Review", resolvedStateType: "started" }, "👀 In Review"],
      [{ type: "ended", resolvedState: "Done", resolvedStateType: "completed" }, "✅ Done"],
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

  it("uses a color for every event status", () => {
    const cases = [
      [{ type: "started" }, "#06B6D4"],
      [{ type: "updated" }, "#3B82F6"],
      [{ type: "retrying" }, "#F59E0B"],
      [{ type: "blocked" }, "#EF4444"],
      [{ type: "ended" }, "#6B7280"],
      [{ type: "ended", resolvedState: "Done" }, "#8B5CF6"],
      [{ type: "ended", resolvedState: "Released", resolvedStateType: "completed" }, "#8B5CF6"],
      [{ type: "ended", resolvedState: "In Review" }, "#22C55E"],
    ];

    for (const [status, expected] of cases) {
      const payload = buildSlackPayload({
        ...status,
        service: "serviceA",
        issueIdentifier: "ENG-62",
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

    assert.equal(payload.text, "🔵 In Progress · [*serviceA*]");
    assert.equal(payload.attachments[0].color, "#EF4444");
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
        "*Event:* Blocked",
        "*Activity:* running tests",
        "*PR:* <https://github.com/example/example-service/pull/123|#123> (OPEN, review required)",
        "*Linear:* <https://linear.app/example/issue/ENG-62/example|ENG-62: Show Linear titles in Slack>",
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
            "*Event:* Ended",
            "*Linear:* <https://linear.app/example/issue/ENG-65/example|ENG-65>",
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
        "*Event:* Ended",
        "*PR:* <https://github.com/example/example-service/pull/123|#123> (OPEN, review required)",
        "*Linear:* <https://linear.app/example/issue/ENG-62/example|ENG-62: Show Linear titles in Slack>",
      ].join("\n"),
    );
  });
});
