/**
 * Vercel Routing Middleware — password-protects the whole site.
 *
 * Runs before every request (dashboard pages AND /api/*), so nobody can
 * read or write the Notion workspace through the API without logging in.
 * Uses HTTP Basic Auth: the browser shows a login prompt once, then
 * automatically re-sends the credentials on every same-origin request —
 * including the pages' fetch("/api/...") calls — so no page code changes.
 *
 * OFF by default — Jarvis is used by one person, so no login is required.
 * To turn it on, set both in Vercel → Settings → Environment Variables:
 *   JARVIS_USER      — login username
 *   JARVIS_PASSWORD  — login password (use a long, random one)
 * With neither set, every request passes straight through.
 */

export const config = {
  matcher: "/:path*",
};

// Compares every character regardless of where the first mismatch is, so
// response timing doesn't reveal how much of a guess was correct.
function safeEqual(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  }
  return diff === 0;
}

function unauthorized() {
  return new Response("Autenticación requerida.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Jarvis", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export default function middleware(request) {
  const user = process.env.JARVIS_USER;
  const password = process.env.JARVIS_PASSWORD;
  if (!user || !password) return; // login not enabled — let the request through

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  let decoded;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch (e) {
    return unauthorized();
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return unauthorized();

  const okUser = safeEqual(decoded.slice(0, sep), user);
  const okPassword = safeEqual(decoded.slice(sep + 1), password);
  if (!okUser || !okPassword) return unauthorized();

  // Returning nothing lets the request continue to the page / function.
}
