import type { Server } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { MOCK_ENDPOINT_ENV } from "./constants.js";
import { loadDynaliteConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { startDynaliteServer, stopDynaliteServer } from "./dynalite-server.js";
import { createSchemaHash, createTables, deleteTables, resetTables } from "./table-manager.js";
import type { LoadedDynaliteConfig } from "../types/config.js";

const GLOBAL_KEY = "__vitest_dynalite_worker_state__";

interface WorkerState {
  logger: Logger;
  initializing?: Promise<void>;
  server?: Server;
  endpoint?: string;
  client?: DynamoDBClient;
  loaded?: LoadedDynaliteConfig;
  schemaHash?: string;
  tablesReady: boolean;
  mswServer?: {
    listen: (options?: { onUnhandledRequest?: "bypass" | "warn" | "error" }) => void;
    resetHandlers: () => void;
    close: () => void;
  };
}

function getGlobalState(): WorkerState {
  const existing = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as WorkerState | undefined;
  if (existing) {
    return existing;
  }

  const initial: WorkerState = {
    logger: createLogger(false),
    tablesReady: false
  };

  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = initial;
  return initial;
}

function ensureClient(state: WorkerState): DynamoDBClient {
  if (!state.client || !state.endpoint || !state.loaded) {
    throw new Error("Dynalite worker runtime has not been initialized.");
  }

  return state.client;
}

export async function ensureWorkerRuntime(): Promise<void> {
  const state = getGlobalState();

  if (state.client && state.server && state.loaded && state.endpoint) {
    process.env[MOCK_ENDPOINT_ENV] = state.endpoint;
    return;
  }

  if (state.initializing) {
    await state.initializing;
    return;
  }

  state.initializing = (async () => {
    state.loaded = await loadDynaliteConfig();
    state.logger = createLogger(state.loaded.options.verbose);

    const serverInfo = await startDynaliteServer(state.loaded.options.basePort, state.logger);
    state.server = serverInfo.server;
    state.endpoint = serverInfo.endpoint;

    state.client = new DynamoDBClient({
      endpoint: state.endpoint,
      region: state.loaded.options.region,
      credentials: {
        accessKeyId: "mock",
        secretAccessKey: "mock"
      }
    });

    process.env[MOCK_ENDPOINT_ENV] = state.endpoint;
  })();

  try {
    await state.initializing;
  } finally {
    state.initializing = undefined;
  }
}

export async function prepareTablesForTestFile(): Promise<void> {
  const state = getGlobalState();
  await ensureWorkerRuntime();

  const refreshed = await loadDynaliteConfig();
  state.loaded = refreshed;

  const client = ensureClient(state);
  const nextHash = createSchemaHash(refreshed.tables);

  if (!state.tablesReady) {
    await createTables(client, refreshed.tables);
    state.tablesReady = true;
    state.schemaHash = nextHash;
    return;
  }

  if (state.schemaHash !== nextHash) {
    await deleteTables(client, refreshed.tables);
    await createTables(client, refreshed.tables);
    state.schemaHash = nextHash;
  }
}

export async function resetTablesForScope(scope: "afterEach" | "afterFile"): Promise<void> {
  const state = getGlobalState();
  if (!state.loaded || !state.tablesReady) {
    return;
  }

  const { resetTiming, resetStrategy } = state.loaded.options;
  if (resetTiming !== scope) {
    return;
  }

  const client = ensureClient(state);
  await resetTables(client, state.loaded.tables, resetStrategy);
}

export async function ensureMswRuntime(): Promise<void> {
  const state = getGlobalState();
  await ensureWorkerRuntime();

  if (!state.loaded?.options.msw.enabled) {
    return;
  }

  if (state.mswServer) {
    return;
  }

  let handlers: unknown[] = [];
  const handlersModulePath = state.loaded.options.msw.handlersModule;
  if (handlersModulePath) {
    const resolvedPath = path.isAbsolute(handlersModulePath)
      ? handlersModulePath
      : path.resolve(process.cwd(), handlersModulePath);

    const imported = await import(pathToFileURL(resolvedPath).href);
    const exportedHandlers = imported.default ?? imported.handlers;
    if (Array.isArray(exportedHandlers)) {
      handlers = exportedHandlers;
    }
  }

  try {
    const { setupServer } = await import("msw/node");
    const server = setupServer(...(handlers as Parameters<typeof setupServer>));
    server.listen({
      onUnhandledRequest: state.loaded.options.msw.onUnhandledRequest ?? "warn"
    });
    state.mswServer = server;
    state.logger.info("MSW server enabled");
  } catch (error) {
    throw new Error(
      `MSW integration is enabled but msw is not available. Install msw or disable msw in config. ${(error as Error).message}`
    );
  }
}

export async function resetMswHandlers(): Promise<void> {
  const state = getGlobalState();
  state.mswServer?.resetHandlers();
}

export async function createTablesNow(): Promise<void> {
  const state = getGlobalState();
  await ensureWorkerRuntime();
  const refreshed = await loadDynaliteConfig();
  state.loaded = refreshed;

  const client = ensureClient(state);
  await createTables(client, refreshed.tables);
  state.schemaHash = createSchemaHash(refreshed.tables);
  state.tablesReady = true;
}

export async function deleteTablesNow(): Promise<void> {
  const state = getGlobalState();
  await ensureWorkerRuntime();
  const refreshed = await loadDynaliteConfig();
  state.loaded = refreshed;

  const client = ensureClient(state);
  await deleteTables(client, refreshed.tables);
  state.tablesReady = false;
}

export async function clearTablesNow(): Promise<void> {
  const state = getGlobalState();
  await ensureWorkerRuntime();
  const refreshed = await loadDynaliteConfig();
  state.loaded = refreshed;

  const client = ensureClient(state);
  await resetTables(client, refreshed.tables, "balanced");
}

export async function stopWorkerRuntime(): Promise<void> {
  const state = getGlobalState();

  if (state.mswServer) {
    state.mswServer.close();
  }

  if (state.client) {
    state.client.destroy();
  }

  await stopDynaliteServer(state.server, state.logger);

  state.client = undefined;
  state.server = undefined;
  state.endpoint = undefined;
  state.loaded = undefined;
  state.schemaHash = undefined;
  state.tablesReady = false;
  state.mswServer = undefined;
}

export function getWorkerEndpoint(): string {
  const state = getGlobalState();
  if (!state.endpoint) {
    throw new Error("Dynalite endpoint is unavailable. Ensure setup has run.");
  }

  return state.endpoint;
}
