declare module "dynalite" {
  import type { Server } from "node:http";

  interface DynaliteOptions {
    createTableMs?: number;
    deleteTableMs?: number;
    updateTableMs?: number;
    path?: string;
  }

  function dynalite(options?: DynaliteOptions): Server;

  export default dynalite;
}
