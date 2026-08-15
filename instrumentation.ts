export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// @sentry/nextjs's own captureRequestError (and any other import from its
// barrel index.server.js) drags in withSentryConfig's bundler-plugin chain
// even when unused — Rolldown can't tree-shake through its dynamic imports,
// and one of those chunks does `createRequire(__filename)` at module scope,
// which throws immediately in this project's pure-ESM Vercel runtime. This
// reimplements captureRequestError's actual logic (see
// @sentry/nextjs/build/esm/common/captureRequestError.js) against
// @sentry/node directly, which has no such dependency.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { withScope, captureException } = await import("@sentry/node");
  withScope((scope) => {
    scope.setContext("nextjs", {
      request_path: request.path,
      router_kind: context.routerKind,
      router_path: context.routePath,
      route_type: context.routeType,
    });
    scope.setTransactionName(`${request.method} ${context.routePath}`);
    captureException(error, {
      mechanism: { handled: false, type: "auto.function.nextjs.on_request_error" },
    });
  });
}
