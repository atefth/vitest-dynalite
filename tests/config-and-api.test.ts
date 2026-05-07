import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { withDynalite } from "../src/index.js";
import { INTERNAL_OPTIONS_ENV } from "../src/runtime/constants.js";
import { loadDynaliteConfig } from "../src/runtime/config.js";
import { setup } from "../src/setup.js";

const originalCwd = process.cwd();
const originalInternalOptions = process.env[INTERNAL_OPTIONS_ENV];
const originalCi = process.env.CI;

let tempDirs: string[] = [];

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "vitest-dynalite-"));
  tempDirs.push(workspace);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const target = path.join(workspace, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, "utf8");
    })
  );

  return workspace;
}

function getRuntimeOptions(): Record<string, unknown> {
  const raw = process.env[INTERNAL_OPTIONS_ENV];
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

beforeEach(() => {
  delete process.env[INTERNAL_OPTIONS_ENV];
  delete process.env.CI;
  process.chdir(originalCwd);
});

afterEach(async () => {
  process.chdir(originalCwd);

  await Promise.all(tempDirs.map(async (dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

afterAll(() => {
  process.chdir(originalCwd);

  if (originalInternalOptions === undefined) {
    delete process.env[INTERNAL_OPTIONS_ENV];
  } else {
    process.env[INTERNAL_OPTIONS_ENV] = originalInternalOptions;
  }

  if (originalCi === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCi;
  }
});

describe.sequential("config loading and public API behavior", () => {
  it("defaults resetTiming to afterEach when not provided", async () => {
    const workspace = await createWorkspace({
      "vitest-dynalite.config.cjs": `module.exports = { tables: [{ TableName: "users" }] };`
    });

    process.chdir(workspace);

    const loaded = await loadDynaliteConfig();

    expect(loaded.options.resetTiming).toBe("afterEach");
    expect(loaded.options.resetStrategy).toBe("balanced");
  });

  it("discovers legacy jest-dynalite config file names for migration", async () => {
    const workspace = await createWorkspace({
      "jest-dynalite-config.cjs": `module.exports = { tables: [{ TableName: "legacy" }] };`
    });

    process.chdir(workspace);

    const loaded = await loadDynaliteConfig();

    expect(loaded.tables[0]?.TableName).toBe("legacy");
  });

  it("prioritizes runtime options over config file options", async () => {
    const workspace = await createWorkspace({
      "vitest-dynalite.config.cjs": `module.exports = {
        tables: [{ TableName: "users" }],
        resetTiming: "afterFile",
        region: "config-region"
      };`
    });

    process.chdir(workspace);
    process.env[INTERNAL_OPTIONS_ENV] = JSON.stringify({
      resetTiming: "afterEach",
      region: "runtime-region"
    });

    const loaded = await loadDynaliteConfig();

    expect(loaded.options.resetTiming).toBe("afterEach");
    expect(loaded.options.region).toBe("runtime-region");
  });

  it("throws when multiple config files exist in the same directory", async () => {
    const workspace = await createWorkspace({
      "vitest-dynalite.config.cjs": `module.exports = { tables: [{ TableName: "users" }] };`,
      "jest-dynalite-config.cjs": `module.exports = { tables: [{ TableName: "legacy" }] };`
    });

    process.chdir(workspace);

    await expect(loadDynaliteConfig()).rejects.toThrow(/Multiple dynalite config files/);
  });

  it("throws a clear message when no config file is found", async () => {
    const workspace = await createWorkspace({
      "README.txt": "empty"
    });

    process.chdir(workspace);

    await expect(loadDynaliteConfig()).rejects.toThrow(/No dynalite config found/);
  });

  it("withDynalite appends setup runtime once and merges options", () => {
    const first = withDynalite(
      {
        test: {
          setupFiles: ["./existing-setup.ts"]
        }
      },
      {
        msw: {
          enabled: true,
          onUnhandledRequest: "error"
        }
      }
    );

    const second = withDynalite(first, {
      msw: {
        handlersModule: "./handlers.ts"
      }
    });

    const setupFiles = second.test?.setupFiles as string[];
    expect(setupFiles).toContain("./existing-setup.ts");
    expect(
      setupFiles.filter(
        (value) =>
          value.endsWith("runtime/setup-file.js") ||
          value.endsWith("runtime\\setup-file.js")
      )
    ).toHaveLength(1);

    expect(getRuntimeOptions()).toMatchObject({
      msw: {
        enabled: true,
        onUnhandledRequest: "error",
        handlersModule: "./handlers.ts"
      }
    });
  });

  it("setup resolves directory input to vitest-dynalite.config.js", () => {
    setup("/tmp/project-root", { resetStrategy: "strict" });

    expect(getRuntimeOptions()).toMatchObject({
      configPath: path.join("/tmp/project-root", "vitest-dynalite.config.js"),
      resetStrategy: "strict"
    });
  });

  it("setup keeps explicit config file path untouched", () => {
    setup("/tmp/project-root/custom-config.cjs");

    expect(getRuntimeOptions()).toMatchObject({
      configPath: "/tmp/project-root/custom-config.cjs"
    });
  });
});
