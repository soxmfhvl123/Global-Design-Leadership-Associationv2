/**
 * GDLA Admin Backend — Cloudflare Worker
 * ---------------------------------------------------------------
 * This Worker is the ONLY thing that ever sees the real GitHub token.
 * The static admin.html page never sees it — it only ever talks to
 * this Worker, and this Worker talks to GitHub on the page's behalf.
 *
 * Endpoints:
 *   POST /api/login       { name, password }            -> { token, person }
 *   GET  /api/session     (Bearer token)                 -> { person }
 *   GET  /api/file?path=... (Bearer token)               -> { content, sha }   content = base64
 *   PUT  /api/file        (Bearer token) { path, contentBase64, sha, message }
 *   POST /api/track-view  { slug, count }  (no auth — called by public article pages)
 *                                                        -> { slug, views }
 *
 * Required secrets (set with `wrangler secret put <NAME>`):
 *   GITHUB_TOKEN     - a GitHub Personal Access Token with `repo` scope
 *   ADMIN_PASSWORD   - the shared team login password
 *   SESSION_SECRET   - random string used to sign session tokens
 *
 * Required binding (see wrangler.toml):
 *   VIEWS            - a Workers KV namespace, used to store live article view counts
 *
 * Nothing else needs to be configured by hand — everyone on the team
 * logs in with just their first name + the shared password, and the
 * Worker figures out who they are from the TEAM table below.
 */

const GH_OWNER = 'soxmfhvl123';
const GH_REPO = 'Global-Design-Leadership-Associationv2';
const GH_BRANCH = 'main';

// Historical view counts for articles that were live (with a hardcoded number in their
// HTML) before we started tracking real visits in KV — so switching to live counting
// doesn't reset what they already had back down to zero.
const VIEW_SEED = {
  'designing-the-boundary': 963,
};

// Allowed login names -> which team page + display name they control.
// Add a new teammate by adding one line here — nothing else to change.
const TEAM = [
  { firstName: 'piia', slug: 'piia-l', name: 'Piia L.' },
  { firstName: 'niina', slug: 'niina', name: 'Niina' },
  { firstName: 'cathy', slug: 'cathy-d', name: 'Cathy D.' },
  { firstName: 'jeremy', slug: 'jeremy-t', name: 'Jeremy T.' },
  { firstName: 'mariana', slug: 'mariana-v', name: 'Mariana V.' },
  { firstName: 'phillip', slug: 'phillip-g', name: 'Phillip G.' },
  { firstName: 'kat', slug: 'kat-e', name: 'Kat E.' },
  { firstName: 'lauren', slug: 'lauren-w', name: 'Lauren W.' },
  { firstName: 'caleb', slug: 'caleb-e', name: 'Caleb E.' },
];

// Only paths under these prefixes may ever be written by this Worker,
// no matter what a caller sends — this is the server-side safety net.
const WRITE_PREFIXES = ['team/', 'our-works/', 'assets/uploads/', 'assets/data/', 'articles/'];
// A few generated files live at exact top-level paths rather than under a prefix.
const WRITE_EXACT_PATHS = ['articles.html'];

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function b64urlEncode(bytes) {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeToString(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    utf8ToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signToken(payloadObj, secret) {
  const payload = JSON.stringify(payloadObj);
  const payloadB64 = b64urlEncode(utf8ToBytes(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, utf8ToBytes(payloadB64));
  const sigB64 = b64urlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  if (!token || token.indexOf('.') === -1) return null;
  const [payloadB64, sigB64] = token.split('.');
  const key = await hmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, utf8ToBytes(payloadB64));
  const expectedSigB64 = b64urlEncode(new Uint8Array(expectedSig));
  if (expectedSigB64 !== sigB64) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToString(payloadB64));
  } catch (e) {
    return null;
  }
  if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

function getBearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(request, env) {
  const token = getBearer(request);
  const payload = token ? await verifyToken(token, env.SESSION_SECRET) : null;
  if (!payload) return null;
  return payload; // { slug, name, iat, exp }
}

function pathIsAllowed(path) {
  if (typeof path !== 'string') return false;
  if (WRITE_EXACT_PATHS.includes(path)) return true;
  return WRITE_PREFIXES.some((p) => path.startsWith(p));
}

function isValidSlug(s) {
  return typeof s === 'string' && /^[a-z0-9-]{1,100}$/.test(s);
}

async function githubFetch(env, path, opts) {
  return fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${path}`, {
    ...opts,
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      'User-Agent': 'gdla-admin-worker',
      Accept: 'application/vnd.github+json',
      ...(opts && opts.headers),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = String(body.name || '').trim().toLowerCase();
        const password = String(body.password || '');
        const person = TEAM.find((t) => t.firstName === name);
        if (!person || password !== env.ADMIN_PASSWORD) {
          return json({ error: 'Invalid name or password.' }, 401, origin);
        }
        const now = Math.floor(Date.now() / 1000);
        const token = await signToken(
          { slug: person.slug, name: person.name, iat: now, exp: now + SESSION_TTL_SECONDS },
          env.SESSION_SECRET
        );
        return json({ token, person: { slug: person.slug, name: person.name } }, 200, origin);
      }

      // Public — called from every article page on every visit, no login involved.
      // Counts a real visit once (count !== false) and always returns the current total,
      // so a page can show the live number even on a repeat view it doesn't want to count again.
      if (url.pathname === '/api/track-view' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || '');
        if (!isValidSlug(slug)) return json({ error: 'Invalid slug.' }, 400, origin);
        if (!env.VIEWS) return json({ error: 'View counter is not configured yet.' }, 500, origin);
        const key = `views:${slug}`;
        const stored = await env.VIEWS.get(key);
        let current = stored !== null ? parseInt(stored, 10) : (VIEW_SEED[slug] || 0);
        if (!Number.isFinite(current)) current = VIEW_SEED[slug] || 0;
        if (body.count !== false) {
          current += 1;
          await env.VIEWS.put(key, String(current));
        }
        return json({ slug, views: current }, 200, origin);
      }

      if (url.pathname === '/api/session' && request.method === 'GET') {
        const auth = await requireAuth(request, env);
        if (!auth) return json({ error: 'Not signed in.' }, 401, origin);
        return json({ person: { slug: auth.slug, name: auth.name } }, 200, origin);
      }

      if (url.pathname === '/api/file' && request.method === 'GET') {
        const auth = await requireAuth(request, env);
        if (!auth) return json({ error: 'Not signed in.' }, 401, origin);
        const path = url.searchParams.get('path');
        if (!path) return json({ error: 'Missing path.' }, 400, origin);
        const res = await githubFetch(env, `contents/${path}?ref=${GH_BRANCH}`);
        if (res.status === 404) return json({ notFound: true }, 404, origin);
        if (!res.ok) return json({ error: `GitHub read failed (${res.status})` }, 502, origin);
        const data = await res.json();
        return json({ content: data.content, encoding: data.encoding, sha: data.sha }, 200, origin);
      }

      if (url.pathname === '/api/file' && request.method === 'PUT') {
        const auth = await requireAuth(request, env);
        if (!auth) return json({ error: 'Not signed in.' }, 401, origin);
        const body = await request.json().catch(() => ({}));
        const { path, contentBase64, message } = body;
        if (!pathIsAllowed(path)) {
          return json({ error: 'That path is not allowed.' }, 403, origin);
        }
        if (typeof contentBase64 !== 'string') {
          return json({ error: 'Missing contentBase64.' }, 400, origin);
        }
        // Always re-check the current sha server-side right before writing,
        // so the client never has to juggle sha bookkeeping or race conditions.
        let sha;
        const shaRes = await githubFetch(env, `contents/${path}?ref=${GH_BRANCH}`);
        if (shaRes.ok) {
          const shaData = await shaRes.json();
          sha = shaData.sha;
        } // 404 = new file, no sha needed

        const putRes = await githubFetch(env, `contents/${path}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message || `Update ${path} via GDLA admin (${auth.name})`,
            content: contentBase64,
            branch: GH_BRANCH,
            ...(sha ? { sha } : {}),
          }),
        });
        if (!putRes.ok) {
          const errText = await putRes.text();
          return json({ error: `GitHub write failed (${putRes.status}): ${errText}` }, 502, origin);
        }
        const putData = await putRes.json();
        return json({ ok: true, sha: putData.content && putData.content.sha }, 200, origin);
      }

      return json({ error: 'Not found.' }, 404, origin);
    } catch (err) {
      return json({ error: 'Worker error: ' + (err && err.message ? err.message : String(err)) }, 500, origin);
    }
  },
};
