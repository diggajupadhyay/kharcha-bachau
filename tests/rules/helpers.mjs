/**
 * Minimal harness for exercising firestorerules.txt against the Firestore emulator
 * over its REST API.
 *
 * Deliberately dependency-free. `@firebase/rules-unit-testing` would work too, but
 * this needs nothing beyond Node and the emulator that `firebase emulators:exec`
 * already starts, so it cannot drift out of step with the app's Firebase version.
 */

const PID = process.env.GCLOUD_PROJECT || 'kharchabachau';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/${PID}/databases/(default)/documents`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Unsigned JWT — the emulator accepts these and applies rules to them. */
const token = (uid) => {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'none', typ: 'JWT' }),
    b64({
      iss: `https://securetoken.google.com/${PID}`,
      aud: PID,
      sub: uid,
      user_id: uid,
      auth_time: now,
      iat: now,
      exp: now + 3600,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    }),
    '',
  ].join('.');
};

/** JS value → Firestore REST typed value. */
export const V = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(V) } };
  return { mapValue: { fields: F(v) } };
};

export const F = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, V(v)]));

/** `uid` omitted means the admin bypass, used only for seeding fixtures. */
export const call = async (method, path, { uid, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${uid ? token(uid) : 'owner'}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

export const seed = (path, data) => call('PATCH', path, { body: { fields: F(data) } });

/** Mirrors updateDoc({ field: value }) — only the named paths are sent. */
export const patch = (uid, path, data, fieldPaths) => {
  const mask = (fieldPaths || Object.keys(data))
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  return call('PATCH', `${path}?${mask}`, { uid, body: { fields: F(data) } });
};

// --- assertions ---------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

export const check = (name, expectAllowed, status) => {
  const allowed = status === 200;
  if (allowed === expectAllowed) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(
      `  \x1b[31m✗\x1b[0m ${name} — expected ${expectAllowed ? 'allow' : 'deny'}, got ${allowed ? 'allow' : `deny (${status})`}`
    );
  }
};

export const describe = (name) => console.log(`\n\x1b[1m${name}\x1b[0m`);

export const report = () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
};
