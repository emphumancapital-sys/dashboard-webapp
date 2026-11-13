import crypto from "node:crypto";
import { cookieValue } from "./http.mjs";
import { getUsers, ensureSystemSheets } from "./sheets.mjs";

const COOKIE = process.env.SESSION_COOKIE_NAME || "emp_session";
const TTL = 60 * 60 * 8;

function secret() {
  const value = process.env.JWT_SECRET || "";
  if (value.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return value;
}
function sign(data) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}
export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ sub:user.username, role:user.role, exp:Date.now()+TTL*1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readSession(event) {
  const token = cookieValue(event, COOKIE);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload,"base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
export function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
}
export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function requireAdmin(event) {
  const session = readSession(event);
  if (!session || session.role !== "Admin") return null;
  await ensureSystemSheets();
  const users = await getUsers();
  const user = users.find(u => u.username.toLowerCase() === String(session.sub).toLowerCase());
  if (!user || user.status !== "Active" || user.role !== "Admin") return null;
  return user;
}
export const cookieName = COOKIE;
