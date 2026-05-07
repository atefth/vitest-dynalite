import path from "node:path";
import { fileURLToPath } from "node:url";

import type { UserConfig } from "vitest/config";

import { INTERNAL_OPTIONS_ENV } from "./runtime/constants.js";
import type { DynalitePluginOptions } from "./types/config.js";
export type {
  DynaliteConfigFile,
  DynaliteConfigTable,
  DynalitePluginOptions,
  MswOptions,
  ResetStrategy,
  ResetTiming
} from "./types/config.js";

export { setup, startDb, stopDb, createTables, deleteTables, clearTables } from "./setup.js";
export { defineMswOptions } from "./msw.js";

function toList<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function runtimePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function mergeOptions(next: DynalitePluginOptions): DynalitePluginOptions {
  const currentRaw = process.env[INTERNAL_OPTIONS_ENV];
  if (!currentRaw) {
    return next;
  }

  try {
    const current = JSON.parse(currentRaw) as DynalitePluginOptions;
    return {
      ...current,
      ...next,
      msw: {
        ...(typeof current.msw === "object" ? current.msw : {}),
        ...(typeof next.msw === "object" ? next.msw : {})
      }
    };
  } catch {
    return next;
  }
}

export function withDynalite(config: UserConfig = {}, options: DynalitePluginOptions = {}): UserConfig {
  const normalizedOptions: DynalitePluginOptions = {
    ...options,
    configPath: options.configPath ? path.resolve(options.configPath) : undefined
  };

  process.env[INTERNAL_OPTIONS_ENV] = JSON.stringify(mergeOptions(normalizedOptions));

  const testConfig = config.test ?? {};
  const setupFile = runtimePath("./runtime/setup-file.js");
  const environmentFile = runtimePath("./environment.js");

  const existingSetupFiles = toList(testConfig.setupFiles);
  const mergedSetupFiles = Array.from(new Set([...existingSetupFiles, setupFile]));

  return {
    ...config,
    test: {
      ...testConfig,
      environment: environmentFile,
      setupFiles: mergedSetupFiles
    }
  };
}
