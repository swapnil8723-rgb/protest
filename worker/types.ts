// The slice of the Workers runtime the API uses, typed by hand so the worker needs no
// extra type package and also runs under `node --test` (tests/worker.test.ts fakes D1).
export interface D1Result<T> {
  results: T[];
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  INBOX: D1Database;
  READER_REPO?: string;
  READER_SALT?: string;
  GITHUB_DISPATCH_TOKEN?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
