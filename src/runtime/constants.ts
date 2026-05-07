export const INTERNAL_OPTIONS_ENV = "VITEST_DYNALITE_OPTIONS";
export const MOCK_ENDPOINT_ENV = "MOCK_DYNAMODB_ENDPOINT";

export const DEFAULT_REGION = "local";

export const DEFAULT_CONFIG_FILES = [
  "vitest-dynalite.config.ts",
  "vitest-dynalite.config.js",
  "vitest-dynalite.config.mjs",
  "vitest-dynalite.config.cjs",
  "jest-dynalite-config.ts",
  "jest-dynalite-config.js",
  "jest-dynalite-config.cjs"
] as const;
