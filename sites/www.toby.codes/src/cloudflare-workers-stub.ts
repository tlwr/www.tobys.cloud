/** Vitest stand-in for the `cloudflare:workers` runtime module. */
export class WorkerEntrypoint<Env = unknown> {
  readonly ctx: ExecutionContext;
  readonly env: Env;

  constructor(ctx: ExecutionContext, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
