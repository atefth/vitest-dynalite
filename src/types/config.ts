import type { CreateTableCommandInput } from "@aws-sdk/client-dynamodb";

export type ResetTiming = "afterEach" | "afterFile";
export type ResetStrategy = "balanced" | "strict" | "fast";

export interface MswOptions {
  enabled?: boolean;
  handlersModule?: string;
  onUnhandledRequest?: "bypass" | "warn" | "error";
}

export interface DynalitePluginOptions {
  configPath?: string;
  basePort?: number;
  region?: string;
  resetTiming?: ResetTiming;
  resetStrategy?: ResetStrategy;
  verbose?: boolean;
  msw?: boolean | MswOptions;
}

export interface DynaliteConfigTable extends CreateTableCommandInput {
  data?: Array<Record<string, unknown>>;
}

export interface DynaliteConfigFile {
  tables: DynaliteConfigTable[] | (() => DynaliteConfigTable[] | Promise<DynaliteConfigTable[]>);
  basePort?: number;
  region?: string;
  resetTiming?: ResetTiming;
  resetStrategy?: ResetStrategy;
  msw?: MswOptions;
}

export interface NormalizedDynaliteOptions {
  configPath?: string;
  basePort?: number;
  region: string;
  resetTiming: ResetTiming;
  resetStrategy: ResetStrategy;
  verbose: boolean;
  msw: MswOptions;
}

export interface LoadedDynaliteConfig {
  tables: DynaliteConfigTable[];
  options: NormalizedDynaliteOptions;
}
