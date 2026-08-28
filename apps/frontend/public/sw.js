/**
 * Delego service worker (hand-rolled — no serwist/workbox build step, since
 * Next.js App Router hashes most JS/CSS chunk filenames at build time and we
 * have no build-time hook to learn them here). Strategy:
 *
 * 1. PRECACHE (install): a small set of path-stable shell resources —
 *    "/", "/offline", the manifest, and the icon set. These never 404 and
 *    don't depend on build hashes.
 *
 * 2. RUNTIME CACHE (fetch):
 *      - Navigations (`request.mode === "navigate"`): network-first. A
 *        successful response is stored in the pages cache (so a page you've
 *        actually visited is available offline verbatim, including its own
 *        hashed script/style tags — see the static-asset branch below, which
 *        opportunistically caches those as they're requested). On failure:
 *          - Cached copy of that exact URL, if we have one.
 *          - Otherwise, for protected routes (see PROTECTED_PATHS, mirrors
 *            middleware.ts #406) when we can determine via cookieStore that
 *            there's no auth cookie, redirect to /login — same as the
 *            middleware would have, so we don't show a signed-in-looking
 *            shell with nothing in it.
 *          - Otherwise the precached "/offline" page (branded fallback that
 *            lists cached reads).
 *      - Static, content-hashed assets (`/_next/static/*`, `/icons/*`,
 *        `/manifest.webmanifest`): cache-first. Safe because these URLs are
 *        immutable — a given hash never changes content — so staleness isn't
 *        possible.
 *      - Everything else GET (`request.destination === ""`, i.e. fetch/XHR
 *        calls — this is how the SDK's API reads look): network-first,
 *        falling back to a cached copy when offline, and caching successful
 *        reads for the offline page to list. Requests whose path looks
 *        auth-related (see AUTH_PATH_PATTERN) are never read from or written
 *        to cache, regardless of method.
 *      - Non-GET requests (POST/PUT/PATCH/DELETE — every mutation in this
 *        app: approve/reject order, create/update/revoke delegation, etc.)
 *        are never intercepted at all. `respondWith` is simply not called,
 *        so the browser's normal network path handles them untouched. This
 *        is the whole "never cache mutating endpoints" guarantee — it's
 *        enforced by HTTP method, not by trying to enumerate endpoint URLs
 *        we can't see from here (the SDK internals live in a private
 *        package, @delegolabs/sdk).
 *
 * Bump CACHE_VERSION when this file's caching behavior changes; old caches
 * are swept on activate.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `delego-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `delego-static-${CACHE_VERSION}`;
const PAGES_CACHE = `delego-pages-${CACHE_VERSION}`;
// Keep this name in sync with API_READS_CACHE_NAME in lib/offlineCache.ts —
// the offline page reads this cache by name to list what's available.
const API_READS_CACHE = `delego-api-reads-${CACHE_VERSION}`;
const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE, PAGES_CACHE, API_READS_CACHE];

const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Mirrors middleware.ts's PROTECTED_ROUTES (#406) exactly — routes that
// require auth. Keep in sync with that list.
const PROTECTED_PATHS = ["/delegations", "/orders", "/wallet", "/settings"];
const AUTH_TOKEN_COOKIE = "delego_auth_token";

// Never read/write cache for anything that looks like an auth flow, even on
// GET — session state shouldn't be replayed from disk.
const AUTH_PATH_PATTERN = /\/(auth|login|logout|session|token|refresh)(\/|$|\?)/i;

const CACHED_AT_HEADER = "x-delego-cached-at";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll aborts entirely if any single request fails — try each
      // individually instead so one missing asset can't break install.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Offline-at-install or a bad URL — non-fatal, just skip it.
          }
        })
      );
      // First install (no controller yet) can activate immediately so
      // offline support is available on the next refresh. Subsequent
      // updates stay in `waiting` until the in-app toast (#626) posts
      // SKIP_WAITING — surprise reloads mid-task are the bug this avoids.
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !ALL_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function isProtectedPath(pathname) {
  return PROTECTED_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Stamp a response with a cached-at header, since Cache API entries don't carry one by default. */
async function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  const stamped = new Response(await response.clone().blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
}

async function handleNavigate(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (isProtectedPath(url.pathname) && "cookieStore" in self) {
      try {
        const token = await self.cookieStore.get(AUTH_TOKEN_COOKIE);
        if (!token) {
          const loginUrl = new URL("/login", url.origin);
          loginUrl.searchParams.set("returnTo", url.pathname);
          return Response.redirect(loginUrl, 302);
        }
      } catch {
        // cookieStore read failed — fall through to the offline page rather
        // than guessing at auth state.
      }
    }

    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ??
      new Response("Offline", { status: 503, statusText: "Offline" })
    );
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleApiRead(request) {
  const cache = await caches.open(API_READS_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await putWithTimestamp(cache, request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch mutations

  const url = new URL(request.url);
  if (AUTH_PATH_PATTERN.test(url.pathname)) return; // never cache auth flows

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (url.origin === self.location.origin && isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  if (request.destination === "") {
    // fetch()/XHR reads — this is how @delegolabs/sdk talks to the API.
    event.respondWith(handleApiRead(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
