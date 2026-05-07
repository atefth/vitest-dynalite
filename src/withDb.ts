import { afterAll, afterEach, beforeAll } from "vitest";

import {
  ensureMswRuntime,
  prepareTablesForTestFile,
  resetMswHandlers,
  resetTablesForScope,
  stopWorkerRuntime
} from "./runtime/worker-state.js";

beforeAll(async () => {
  await prepareTablesForTestFile();
  await ensureMswRuntime();
});

afterEach(async () => {
  await resetTablesForScope("afterEach");
  await resetMswHandlers();
});

afterAll(async () => {
  await resetTablesForScope("afterFile");
  await stopWorkerRuntime();
});
