import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findPullRequest } from "./pull-request.mjs";

describe("findPullRequest", () => {
  it("returns null when the event has no workspace path", async () => {
    const result = await findPullRequest({}, { execFile: async () => assert.fail("execFile should not be called") });

    assert.equal(result, null);
  });

  it("returns null for Todo events", async () => {
    const result = await findPullRequest(
      { workspacePath: "/tmp/repo", state: "Todo", issueIdentifier: "ENG-65" },
      { execFile: async () => assert.fail("execFile should not be called for Todo") },
    );

    assert.equal(result, null);
  });

  it("returns PR metadata from gh pr view", async () => {
    const result = await findPullRequest(
      { workspacePath: "/tmp/repo", state: "In Progress", issueIdentifier: "ENG-65" },
      {
        execFile: async (command, args, options) => {
          assert.equal(command, "gh");
          assert.deepEqual(args, ["pr", "view", "--json", "url,number,state,isDraft,reviewDecision,headRefName"]);
          assert.equal(options.cwd, "/tmp/repo");

          return {
            stdout: JSON.stringify({
              url: "https://github.com/example/example-service/pull/123",
              number: 123,
              state: "OPEN",
              isDraft: false,
              reviewDecision: "REVIEW_REQUIRED",
              headRefName: "eng-65-contact-form",
            }),
          };
        },
      },
    );

    assert.deepEqual(result, {
      url: "https://github.com/example/example-service/pull/123",
      number: 123,
      state: "OPEN",
      isDraft: false,
      reviewDecision: "REVIEW_REQUIRED",
      headRefName: "eng-65-contact-form",
    });
  });

  it("returns null when gh finds a PR for a stale branch", async () => {
    const result = await findPullRequest(
      { workspacePath: "/tmp/repo", state: "In Progress", issueIdentifier: "ENG-65" },
      {
        execFile: async () => ({
          stdout: JSON.stringify({
            url: "https://github.com/example/worker-service/pull/91",
            number: 91,
            state: "OPEN",
            isDraft: true,
            reviewDecision: "",
            headRefName: "fix/issue-86-clear-stale-subagents",
          }),
        }),
      },
    );

    assert.equal(result, null);
  });

  it("returns null when gh cannot find a pull request", async () => {
    const result = await findPullRequest(
      { workspacePath: "/tmp/repo" },
      {
        execFile: async () => {
          throw new Error("no pull requests found");
        },
      },
    );

    assert.equal(result, null);
  });
});
