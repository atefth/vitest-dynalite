export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const PREFIX = "[vitest-dynalite]";

export function createLogger(verbose: boolean): Logger {
  return {
    info: (message: string) => {
      if (verbose) {
        console.info(`${PREFIX} ${message}`);
      }
    },
    warn: (message: string) => {
      console.warn(`${PREFIX} ${message}`);
    },
    error: (message: string) => {
      console.error(`${PREFIX} ${message}`);
    }
  };
}
