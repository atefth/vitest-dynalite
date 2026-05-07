import path from "node:path";

import { INTERNAL_OPTIONS_ENV } from "./runtime/constants.js";
import {
  clearTablesNow,
  createTablesNow,
  deleteTablesNow,
  ensureWorkerRuntime,
  stopWorkerRuntime
} from "./runtime/worker-state.js";
import type { DynalitePluginOptions } from "./types/config.js";

function mergeOptions(next: DynalitePluginOptions): DynalitePluginOptions {
  const current = process.env[INTERNAL_OPTIONS_ENV];
  if (!current) {
    return next;
  }

  try {
    const parsed = JSON.parse(current) as DynalitePluginOptions;
    return {
      ...parsed,
      ...next,
      msw: {
        ...(typeof parsed.msw === "object" ? parsed.msw : {}),
        ...(typeof next.msw === "object" ? next.msw : {})
      }
    };
  } catch {
    return next;
  }
}

export function setup(configDirectoryOrFile: string, options: DynalitePluginOptions = {}): void {
  const configPath = path.isAbsolute(configDirectoryOrFile)
    ? configDirectoryOrFile
    : path.resolve(configDirectoryOrFile);

  const configOption = path.extname(configPath)
    ? configPath
    : path.join(configPath, "vitest-dynalite.config.js");

  const merged = mergeOptions({
    ...options,
    configPath: configOption
  });

  process.env[INTERNAL_OPTIONS_ENV] = JSON.stringify(merged);
}

export async function startDb(): Promise<void> {
  await ensureWorkerRuntime();
}

export async function stopDb(): Promise<void> {
  await stopWorkerRuntime();
}

export async function createTables(): Promise<void> {
  await createTablesNow();
}

export async function deleteTables(): Promise<void> {
  await deleteTablesNow();
}

export async function clearTables(): Promise<void> {
  await clearTablesNow();
}
