import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runOnce } from "./watcher.mjs";

describe("runOnce", () => {
  it("enriches started events with the Linear issue title", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    const current = {
      running: [{ issue_identifier: "ENG-62", state: "In Progress" }],
      retrying: [],
      blocked: [],
    };

    await writeFile(statePath, "{}");
    const nativeFetch = globalThis.fetch;
    context.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).startsWith("data:")) return nativeFetch(url, options);

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-62",
              title: "Show Linear titles in Slack",
              state: { name: "In Progress", type: "started" },
              url: "https://linear.app/example/issue/ENG-62/example",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const originalLog = console.log;
      const lines = [];
      console.log = (line) => lines.push(line);

      try {
        await runOnce({
          config: {
            services: [{ name: "serviceA", url: `data:application/json,${encodeURIComponent(JSON.stringify(current))}` }],
            linearApiKey: "lin_test",
          },
          statePath,
          dryRun: true,
        });
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(lines[0]);
      assert.equal(output.event.issueTitle, "Show Linear titles in Slack");
      assert.equal(output.slack.text, "🔵 In Progress · [*serviceA*]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not update state during dry-run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    const previous = {
      serviceA: {
        running: [{ issue_identifier: "ENG-62", state: "In Progress" }],
        retrying: [],
        blocked: [],
      },
    };
    const current = {
      running: [],
      retrying: [],
      blocked: [],
    };

    await writeFile(statePath, JSON.stringify(previous));

    try {
      const originalLog = console.log;
      console.log = () => {};

      try {
        const result = await runOnce({
          config: {
            services: [{ name: "serviceA", url: `data:application/json,${encodeURIComponent(JSON.stringify(current))}` }],
          },
          statePath,
          dryRun: true,
        });

        assert.equal(result.events[0].type, "ended");
      } finally {
        console.log = originalLog;
      }

      assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), previous);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("enriches ended events with current Linear state", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    const previous = {
      serviceA: {
        running: [{ issue_identifier: "ENG-62", state: "In Progress" }],
        retrying: [],
        blocked: [],
      },
    };
    const current = {
      running: [],
      retrying: [],
      blocked: [],
    };

    await writeFile(statePath, JSON.stringify(previous));
    const nativeFetch = globalThis.fetch;
    context.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).startsWith("data:")) return nativeFetch(url, options);

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-62",
              title: "Show Linear titles in Slack",
              state: { name: "In Review", type: "started" },
              url: "https://linear.app/example/issue/ENG-62/example",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const originalLog = console.log;
      const lines = [];
      console.log = (line) => lines.push(line);

      try {
        await runOnce({
          config: {
            services: [{ name: "serviceA", url: `data:application/json,${encodeURIComponent(JSON.stringify(current))}` }],
            linearApiKey: "lin_test",
            inReviewMention: "<@U012AB3CD>",
            endedLinearMaxAttempts: 1,
            endedLinearRetryDelayMs: 0,
          },
          statePath,
          dryRun: true,
        });
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(lines[0]);
      assert.equal(output.event.resolvedState, "In Review");
      assert.equal(output.event.issueTitle, "Show Linear titles in Slack");
      assert.equal(output.slack.text, "👀 In Review · [*serviceA*] <@U012AB3CD>");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes a pull request attached to the Linear issue", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    const current = {
      running: [{ issue_identifier: "ENG-67", state: "In Review" }],
      retrying: [],
      blocked: [],
    };

    await writeFile(statePath, "{}");
    const nativeFetch = globalThis.fetch;
    context.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).startsWith("data:")) return nativeFetch(url, options);

      return new Response(
        JSON.stringify({
          data: {
            issue: {
              identifier: "ENG-67",
              title: "Include attached pull requests",
              state: { name: "In Review", type: "started" },
              url: "https://linear.app/example/issue/ENG-67/example",
              attachments: {
                nodes: [{ url: "https://github.com/example/example-service/pull/456" }],
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    try {
      const originalLog = console.log;
      const lines = [];
      console.log = (line) => lines.push(line);

      try {
        await runOnce({
          config: {
            services: [{ name: "serviceA", url: `data:application/json,${encodeURIComponent(JSON.stringify(current))}` }],
            linearApiKey: "lin_test",
          },
          statePath,
          dryRun: true,
        });
      } finally {
        console.log = originalLog;
      }

      const output = JSON.parse(lines[0]);
      assert.deepEqual(output.event.pullRequest, {
        url: "https://github.com/example/example-service/pull/456",
        number: 456,
      });
      assert.match(output.slack.attachments[0].blocks[1].text.text, /\*PR:\* <https:\/\/github\.com\/example\/example-service\/pull\/456\|#456>/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("tries Linear at most twice by default for ended events", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    const previous = {
      serviceA: {
        running: [{ issue_identifier: "ENG-62", state: "In Progress" }],
        retrying: [],
        blocked: [],
      },
    };
    const current = {
      running: [],
      retrying: [],
      blocked: [],
    };

    await writeFile(statePath, JSON.stringify(previous));
    const nativeFetch = globalThis.fetch;
    let linearAttempts = 0;
    context.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url).startsWith("data:")) return nativeFetch(url, options);

      linearAttempts += 1;
      return new Response("temporary failure", { status: 500 });
    });

    try {
      const originalLog = console.log;
      console.log = () => {};

      try {
        await runOnce({
          config: {
            services: [{ name: "serviceA", url: `data:application/json,${encodeURIComponent(JSON.stringify(current))}` }],
            linearApiKey: "test-key",
            endedLinearRetryDelayMs: 0,
          },
          statePath,
          dryRun: true,
        });
      } finally {
        console.log = originalLog;
      }

      assert.equal(linearAttempts, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps running and reports a service as retrying when its status endpoint is unreachable", async (context) => {
    const dir = await mkdtemp(join(tmpdir(), "orchestrator-watcher-"));
    const statePath = join(dir, "state.json");
    context.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });

    try {
      const originalLog = console.log;
      console.log = () => {};

      try {
        const result = await runOnce({
          config: {
            services: [{ name: "serviceA", url: "http://127.0.0.1:4103/api/v1/state" }],
          },
          statePath,
          dryRun: true,
        });

        assert.deepEqual(result.events.map((event) => event.type), ["retrying"]);
        assert.equal(result.current.serviceA.retrying[0].issue_identifier, "watcher:serviceA");
        assert.match(result.current.serviceA.retrying[0].error, /fetch failed/);
        assert.equal(result.events[0].issueUrl, undefined);
      } finally {
        console.log = originalLog;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
