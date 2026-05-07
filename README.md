# @vitest/dynalite

Vitest-first Dynalite integration with parity goals for jest-dynalite.

## What this package gives you

- Per-worker Dynalite instance by default for parallel test isolation.
- Config-file driven table creation and seed data.
- Reset strategies for balancing speed vs isolation.
- One-line Vitest config helper (`withDynalite`) as the default DX path.
- Advanced manual lifecycle helpers and a `withDb` side-effect helper.
- Optional MSW integration behind config.

## Install

```bash
pnpm add -D @vitest/dynalite vitest
pnpm add @aws-sdk/client-dynamodb
```

Optional:

```bash
pnpm add -D msw
pnpm add aws-sdk
```

Equivalent commands:

```bash
npm i -D @vitest/dynalite vitest
npm i @aws-sdk/client-dynamodb
npm i -D msw
npm i aws-sdk
```

```bash
yarn add -D @vitest/dynalite vitest
yarn add @aws-sdk/client-dynamodb
yarn add -D msw
yarn add aws-sdk
```

## 1) Quickstart (recommended)

Create `vitest-dynalite.config.js`:

```js
/** @type {import('@vitest/dynalite').DynaliteConfigFile} */
export default {
  tables: [
    {
      TableName: "users",
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
      data: [{ id: "seed-user-1" }]
    }
  ]
};
```

Update `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { withDynalite } from "@vitest/dynalite";

export default withDynalite(
  defineConfig({
    test: {
      globals: true
    }
  }),
  {
    resetStrategy: "balanced",
    resetTiming: "afterEach"
  }
);
```

Use in tests (AWS SDK v3):

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
  region: "local",
  credentials: { accessKeyId: "mock", secretAccessKey: "mock" }
});
```

Use in tests (AWS SDK v2):

```ts
import AWS from "aws-sdk";

const dynamodb = new AWS.DynamoDB({
  ...(process.env.MOCK_DYNAMODB_ENDPOINT
    ? {
        endpoint: process.env.MOCK_DYNAMODB_ENDPOINT,
        sslEnabled: false,
        region: "local"
      }
    : {})
});
```

For AWS SDK v3 clients, call `client.destroy()` in `afterAll` to help fast teardown in large suites.

## 2) Advanced Manual Lifecycle

```ts
import {
  setup,
  startDb,
  stopDb,
  createTables,
  deleteTables
} from "@vitest/dynalite";

setup(process.cwd());

beforeAll(async () => {
  await startDb();
  await createTables();
});

afterAll(async () => {
  await deleteTables();
  await stopDb();
});
```

## 3) `withDb` Side-Effect Helper

Add to a suite that should self-manage lifecycle:

```ts
import "@vitest/dynalite/withDb";
```

## Optional MSW Integration

Set in `withDynalite(..., options)`:

```ts
{
  msw: {
    enabled: true,
    handlersModule: "./test/msw-handlers.ts",
    onUnhandledRequest: "warn"
  }
}
```

If enabled, MSW is loaded lazily and will throw a clear error when `msw` is not installed.

## Configuration Reference

`vitest-dynalite.config.js` exports:

```ts
interface DynaliteConfigFile {
  tables: DynaliteConfigTable[] | (() => DynaliteConfigTable[] | Promise<DynaliteConfigTable[]>);
  basePort?: number;
  region?: string;
  resetTiming?: "afterEach" | "afterFile";
  resetStrategy?: "balanced" | "strict" | "fast";
  msw?: {
    enabled?: boolean;
    handlersModule?: string;
    onUnhandledRequest?: "bypass" | "warn" | "error";
  };
}
```

## Notes

- `MOCK_DYNAMODB_ENDPOINT` is set automatically.
- Default `resetTiming` is `afterEach` (override with `resetTiming: "afterFile"` if needed).
- `resetStrategy: "strict"` does delete+recreate.
- `resetStrategy: "balanced"` clears and reseeds.
- `resetStrategy: "fast"` skips automatic reset.

## Publishing

Before first publish, verify package metadata in package.json:

- name
- version
- license
- repository
- homepage
- bugs

Release flow:

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm publish --access public --provenance
```

The prepublishOnly script already enforces check, test, and build during publish.
