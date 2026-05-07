import type { Environment } from "vitest/environments";

import { MOCK_ENDPOINT_ENV } from "./runtime/constants.js";
import { ensureWorkerRuntime, getWorkerEndpoint, stopWorkerRuntime } from "./runtime/worker-state.js";

const env: Environment = {
  name: "vitest-dynalite",
  transformMode: "ssr",
  async setup() {
    await ensureWorkerRuntime();
    process.env[MOCK_ENDPOINT_ENV] = getWorkerEndpoint();

    return {
      async teardown() {
        await stopWorkerRuntime();
      }
    };
  }
};

export default env;
