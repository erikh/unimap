import { serve } from "@hono/node-server";
import { createMockApp, type MockOptions } from "./app";

export interface StartedServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Start the mock on an ephemeral port (or `options.port`). */
export async function startMockServer(options: MockOptions & { port?: number } = {}): Promise<StartedServer> {
  const app = createMockApp(options);
  return new Promise<StartedServer>((resolve) => {
    const server = serve({ fetch: app.fetch, port: options.port ?? 0 }, (info) => {
      resolve({
        url: `http://127.0.0.1:${info.port}`,
        port: info.port,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

// Standalone entry point for `npm run dev:mock` and the Docker image.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_PORT ?? 8788);
  startMockServer({ port, apple: { requireAuth: false } }).then((s) => {
    console.log(`[unimap mock] listening on ${s.url}`);
  });
}
