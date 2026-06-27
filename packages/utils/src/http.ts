import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
) => void | Promise<void>;

export interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export interface HttpServerOptions {
  port: number;
  host?: string;
  serviceName: string;
  version?: string;
  routes?: Route[];
  middleware?: Array<(req: IncomingMessage, res: ServerResponse, next: (err?: any) => void) => void | Promise<void>>;
}

function matchRoute(
  routes: Route[],
  method: string,
  pathname: string
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = match[i + 1] ?? "";
    });
    return { route, params };
  }
  return null;
}

export function route(
  method: string,
  path: string,
  handler: RouteHandler
): Route {
  const paramNames: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:([a-zA-Z]+)/g, (_, name) => {
        paramNames.push(name);
        return "([^/]+)";
      }) +
      "$"
  );
  return { method, pattern, paramNames, handler };
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startHttpServer(options: HttpServerOptions): Server {
  const { port, host = "0.0.0.0", serviceName, version = "0.0.1", routes = [] } =
    options;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    const middlewares = options.middleware ?? [];
    let index = 0;

    const next = async (err?: any) => {
      if (err) {
        json(res, 500, {
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        });
        return;
      }

      if (index < middlewares.length) {
        const mw = middlewares[index++];
        try {
          await mw(req, res, next);
        } catch (mwErr) {
          await next(mwErr);
        }
      } else {
        if (req.method === "GET" && pathname === "/health") {
          json(res, 200, {
            data: {
              status: "ok",
              service: serviceName,
              version,
              timestamp: new Date().toISOString(),
            },
            error: null,
          });
          return;
        }

        const matched = matchRoute(routes, req.method ?? "GET", pathname);
        if (matched) {
          try {
            await matched.route.handler(req, res, matched.params);
          } catch (err) {
            json(res, 500, {
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: err instanceof Error ? err.message : "Unknown error",
              },
            });
          }
          return;
        }

        json(res, 404, {
          data: null,
          error: { code: "NOT_FOUND", message: `Route not found: ${pathname}` },
        });
      }
    };

    await next();
  });

  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[${serviceName}] listening on ${host}:${port}`);
  });

  return server;
}

