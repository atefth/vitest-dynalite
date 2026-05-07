import type { Server } from "node:http";

import getPort from "get-port";
import dynalite from "dynalite";

import type { Logger } from "./logger.js";

export interface DynaliteServerInfo {
  server: Server;
  port: number;
  endpoint: string;
}

function toPoolOffset(): number {
  const poolId = process.env.VITEST_POOL_ID;
  if (!poolId) {
    return 0;
  }

  const parsed = Number.parseInt(poolId, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export async function startDynaliteServer(basePort: number | undefined, logger: Logger): Promise<DynaliteServerInfo> {
  const poolOffset = toPoolOffset();
  const preferredPort = basePort ? basePort + poolOffset : undefined;
  const port = await getPort({ port: preferredPort ? [preferredPort] : undefined });

  const server = dynalite({
    createTableMs: 0,
    deleteTableMs: 0,
    updateTableMs: 0
  });

  await listen(server, port);
  const endpoint = `http://127.0.0.1:${port}`;
  logger.info(`Dynalite started on ${endpoint} for pool ${process.env.VITEST_POOL_ID ?? "0"}`);

  return { server, port, endpoint };
}

export async function stopDynaliteServer(server: Server | undefined, logger: Logger): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  logger.info("Dynalite stopped");
}
