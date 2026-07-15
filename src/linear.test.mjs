import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchLinearIssueState } from "./lib/linear.mjs";

describe("fetchLinearIssueState", () => {
  it("returns current Linear issue state by issue identifier", async () => {
    const calls = [];
    const result = await fetchLinearIssueState("ENG-65", {
      apiKey: "lin_test",
      fetch: async (url, options) => {
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
      },
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
      fetch: async () => assert.fail("fetch should not be called"),
    });

    assert.equal(result, null);
  });

  it("retries transient Linear failures before falling back", async () => {
    let attempts = 0;
    const result = await fetchLinearIssueState("ENG-59", {
      apiKey: "lin_test",
      retryDelayMs: 0,
      fetch: async () => {
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
      },
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

  it("returns immediately when Linear still reports an active state type", async () => {
    let attempts = 0;
    const result = await fetchLinearIssueState("ENG-66", {
      apiKey: "lin_test",
      retryDelayMs: 0,
      fetch: async () => {
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
      },
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
