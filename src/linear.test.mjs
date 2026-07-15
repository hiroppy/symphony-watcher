import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchLinearIssueState } from "./linear.mjs";

describe("fetchLinearIssueState", () => {
  it("returns current Linear issue state by issue identifier", async (context) => {
    const calls = [];
    context.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push({ url, options });

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-65",
              title: "Show Linear titles in Slack",
              state: { name: "In Review", type: "started" },
              url: "https://linear.app/example/issue/ENG-65/example",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await fetchLinearIssueState("ENG-65", {
      apiKey: "lin_test",
    });

    assert.equal(calls[0].url, "https://api.linear.app/graphql");
    assert.equal(calls[0].options.headers.authorization, "lin_test");
    assert.deepEqual(result, {
      identifier: "ENG-65",
      title: "Show Linear titles in Slack",
      state: "In Review",
      stateType: "started",
      url: "https://linear.app/example/issue/ENG-65/example",
    });
  });

  it("returns null when no api key is configured", async () => {
    const result = await fetchLinearIssueState("ENG-65", {
      apiKey: null,
    });

    assert.equal(result, null);
  });

  it("returns a GitHub pull request attached to the Linear issue", async (context) => {
    context.mock.method(globalThis, "fetch", async () => new Response(
      JSON.stringify({
        data: {
          issue: {
            identifier: "ENG-67",
            title: "Include attached pull requests",
            state: { name: "In Review", type: "started" },
            url: "https://linear.app/example/issue/ENG-67/example",
            attachments: {
              nodes: [
                { url: "https://example.com/design/67" },
                { url: "https://github.com/example/example-service/pull/456" },
              ],
            },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    const result = await fetchLinearIssueState("ENG-67", {
      apiKey: "lin_test",
    });

    assert.deepEqual(result.pullRequest, {
      url: "https://github.com/example/example-service/pull/456",
      number: 456,
    });
  });

  it("retries transient Linear failures before falling back", async (context) => {
    let attempts = 0;
    context.mock.method(globalThis, "fetch", async () => {
      attempts += 1;

      if (attempts === 1) {
        return new Response("temporary failure", { status: 500 });
      }

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-59",
              title: "Retry Linear requests",
              state: { name: "Done", type: "completed" },
              url: "https://linear.app/example/issue/ENG-59/example",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await fetchLinearIssueState("ENG-59", {
      apiKey: "lin_test",
      retryDelayMs: 0,
    });

    assert.equal(attempts, 2);
    assert.deepEqual(result, {
      identifier: "ENG-59",
      title: "Retry Linear requests",
      state: "Done",
      stateType: "completed",
      url: "https://linear.app/example/issue/ENG-59/example",
    });
  });

  it("returns immediately when Linear still reports an active state type", async (context) => {
    let attempts = 0;
    context.mock.method(globalThis, "fetch", async () => {
      attempts += 1;

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-66",
              title: "Keep active issues visible",
              state: { name: "In Progress", type: "started" },
              url: "https://linear.app/example/issue/ENG-66/example",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await fetchLinearIssueState("ENG-66", {
      apiKey: "lin_test",
      retryDelayMs: 0,
    });

    assert.equal(attempts, 1);
    assert.deepEqual(result, {
      identifier: "ENG-66",
      title: "Keep active issues visible",
      state: "In Progress",
      stateType: "started",
      url: "https://linear.app/example/issue/ENG-66/example",
    });
  });
});
