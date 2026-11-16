import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * An MSW server for tests that mock external services. Any request no test handler matches is
 * answered with a 599 and recorded, so a test can never reach a real provider by accident.
 */
export function mockServer() {
  const unmocked: string[] = [];
  const server = setupServer(
    http.all("*", ({ request }) => {
      unmocked.push(`${request.method} ${request.url}`);
      return HttpResponse.json({ error: "unmocked request" }, { status: 599 });
    }),
  );
  beforeAll(() => server.listen());
  afterEach(() => {
    server.resetHandlers();
    if (unmocked.length > 0) {
      const seen = unmocked.splice(0).join(", ");
      throw new Error(`Test made unmocked HTTP requests: ${seen}`);
    }
  });
  afterAll(() => server.close());
  return server;
}
