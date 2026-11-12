const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_ITERATIONS = 100000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS staging_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staging_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES staging_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staging_sessions_expiry ON staging_sessions(expires_at);
`;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function base64UrlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_RE.test(normalizedEmail)) return { ok: false, error: 'INVALID_EMAIL' };
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return { ok: false, error: 'INVALID_PASSWORD' };
  return { ok: true, email: normalizedEmail };
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split('=')) .filter(([key, value]) => key && value).map(([key, ...rest]) => [key, decodeURIComponent(rest.join('='))]));
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `qabs_staging_session=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, iterations, saltText, digestText] = String(stored).split('$');
  if (algorithm !== 'pbkdf2' || iterations !== String(PASSWORD_ITERATIONS) || !saltText || !digestText) return false;
  const candidate = await hashPassword(password, base64UrlToBytes(saltText));
  return candidate === stored;
}

function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

async function ensureSchema(db) {
  for (const statement of AUTH_SCHEMA.split(';').map(sql => sql.trim()).filter(Boolean)) await db.prepare(statement).run();
}

function userView(row) {
  return row ? { id: row.id, email: row.email, role: row.role } : null;
}

export async function signUp(db, email, password) {
  const checked = validateCredentials(email, password);
  if (!checked.ok) return { status: 400, body: { error: checked.error } };
  await ensureSchema(db);
  const existing = await db.prepare('SELECT id FROM staging_users WHERE email = ?1').bind(checked.email).first();
  if (existing) return { status: 409, body: { error: 'ACCOUNT_EXISTS' } };
  const user = { id: randomId('usr'), email: checked.email, role: 'customer', createdAt: new Date().toISOString() };
  const passwordHash = await hashPassword(password);
  await db.prepare('INSERT INTO staging_users (id, email, password_hash, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(user.id, user.email, passwordHash, user.role, user.createdAt).run();
  return createSession(db, user);
}

export async function logIn(db, email, password) {
  const checked = validateCredentials(email, password);
  if (!checked.ok) return { status: 401, body: { error: 'INVALID_CREDENTIALS' } };
  await ensureSchema(db);
  const row = await db.prepare('SELECT id, email, password_hash, role FROM staging_users WHERE email = ?1').bind(checked.email).first();
  if (!row || !(await verifyPassword(password, row.password_hash))) return { status: 401, body: { error: 'INVALID_CREDENTIALS' } };
  return createSession(db, row);
}

async function createSession(db, user) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO staging_sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)').bind(tokenHash, user.id, now + SESSION_TTL_SECONDS, new Date().toISOString()).run();
  return { status: 200, body: { ok: true, user: userView(user) }, cookie: sessionCookie(token) };
}

export async function currentUser(db, request) {
  const token = parseCookies(request.headers.get('cookie') || '').qabs_staging_session;
  if (!token) return null;
  await ensureSchema(db);
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT u.id, u.email, u.role FROM staging_sessions s JOIN staging_users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2').bind(tokenHash, now).first();
  return userView(row);
}

export async function logOut(db, request) {
  const token = parseCookies(request.headers.get('cookie') || '').qabs_staging_session;
  if (token) {
    await ensureSchema(db);
    await db.prepare('DELETE FROM staging_sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
  }
  return { status: 200, body: { ok: true }, cookie: sessionCookie('', 0) };
}
