import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { DEFAULT_CONFIG_FILES, DEFAULT_REGION, INTERNAL_OPTIONS_ENV } from "./constants.js";
import type {
  DynaliteConfigFile,
  DynalitePluginOptions,
  LoadedDynaliteConfig,
  NormalizedDynaliteOptions,
  MswOptions
} from "../types/config.js";

function parseRuntimeOptions(): DynalitePluginOptions {
  const raw = process.env[INTERNAL_OPTIONS_ENV];
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as DynalitePluginOptions;
  } catch (error) {
    throw new Error(`Unable to parse ${INTERNAL_OPTIONS_ENV}: ${(error as Error).message}`);
  }
}

function normalizeMswOptions(msw: DynalitePluginOptions["msw"] | MswOptions | undefined): MswOptions {
  if (!msw) {
    return { enabled: false };
  }

  if (typeof msw === "boolean") {
    return { enabled: msw };
  }

  return {
    enabled: msw.enabled ?? true,
    handlersModule: msw.handlersModule,
    onUnhandledRequest: msw.onUnhandledRequest ?? "warn"
  };
}

function normalizeOptions(config: DynaliteConfigFile | undefined, runtime: DynalitePluginOptions): NormalizedDynaliteOptions {
  const resetTiming = runtime.resetTiming ?? config?.resetTiming ?? "afterEach";
  const resetStrategy = runtime.resetStrategy ?? config?.resetStrategy ?? "balanced";

  return {
    configPath: runtime.configPath,
    basePort: runtime.basePort ?? config?.basePort,
    region: runtime.region ?? config?.region ?? DEFAULT_REGION,
    resetTiming,
    resetStrategy,
    verbose: runtime.verbose ?? false,
    msw: normalizeMswOptions(runtime.msw ?? config?.msw)
  };
}

function findNearestConfig(cwd: string): string | undefined {
  let current = cwd;

  while (true) {
    const matches = DEFAULT_CONFIG_FILES
      .map((name) => path.join(current, name))
      .filter((file) => existsSync(file));

    if (matches.length > 1) {
      throw new Error(
        `Multiple dynalite config files were found in ${current}. Set an explicit configPath in withDynalite().`
      );
    }

    if (matches.length === 1) {
      return matches[0];
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function importConfigFile(configPath: string): Promise<DynaliteConfigFile> {
  const imported = await import(pathToFileURL(configPath).href);
  const raw = (imported.default ?? imported) as DynaliteConfigFile;

  if (!raw || typeof raw !== "object") {
    throw new Error(`Dynalite config at ${configPath} must export an object.`);
  }

  return raw;
}

export async function loadDynaliteConfig(): Promise<LoadedDynaliteConfig> {
  const runtimeOptions = parseRuntimeOptions();
  const explicitPath = runtimeOptions.configPath ? path.resolve(runtimeOptions.configPath) : undefined;
  const discoveredPath = explicitPath ?? findNearestConfig(process.cwd());

  if (!discoveredPath) {
    throw new Error(
      "No dynalite config found. Create vitest-dynalite.config.js or set withDynalite({ configPath: ... })."
    );
  }

  const config = await importConfigFile(discoveredPath);
  const tablesOrFactory = config.tables;

  if (!tablesOrFactory) {
    throw new Error(`Dynalite config at ${discoveredPath} is missing the required tables field.`);
  }

  const tables = typeof tablesOrFactory === "function" ? await tablesOrFactory() : tablesOrFactory;

  if (!Array.isArray(tables) || tables.length === 0) {
    throw new Error(`Dynalite config at ${discoveredPath} must define at least one table.`);
  }

  return {
    tables,
    options: normalizeOptions(config, runtimeOptions)
  };
}
