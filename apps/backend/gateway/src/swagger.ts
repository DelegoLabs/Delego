/**
 * Swagger UI Endpoint (Issue #352)
 *
 * Serves the complete OpenAPI 3.0 specification at /api/docs
 * with an interactive Swagger UI for API exploration.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { openApiSpec } from "./openapi.js";

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delego Gateway API — Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none; }
    .info .title { font-size: 1.5em; }
    .info .description { font-size: 1em; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      spec: SPEC_PLACEHOLDER,
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout",
      validatorUrl: null,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;

/**
 * Handle requests to /api/docs — serves Swagger UI HTML.
 * Handle requests to /api/docs/openapi.json — serves the raw OpenAPI spec.
 */
export function swaggerHandler(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>
): void {
  const url = req.url ?? "";

  // Serve raw OpenAPI JSON spec
  if (url === "/api/docs/openapi.json" || url === "/api/docs/openapi.json/") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(openApiSpec, null, 2));
    return;
  }

  // Serve Swagger UI HTML with embedded spec
  const specJson = JSON.stringify(openApiSpec);
  const html = SWAGGER_UI_HTML.replace("SPEC_PLACEHOLDER", specJson);

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(html);
}
