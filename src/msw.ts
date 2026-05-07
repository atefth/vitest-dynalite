import type { MswOptions } from "./types/config.js";

export function defineMswOptions(options: MswOptions = {}): MswOptions {
  return {
    enabled: options.enabled ?? true,
    handlersModule: options.handlersModule,
    onUnhandledRequest: options.onUnhandledRequest ?? "warn"
  };
}
