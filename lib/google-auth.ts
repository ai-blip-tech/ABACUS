import { createSession, ensureStore, normalizeEmail, sessionCookie, tenantForRequest, userForRequest } from "./auth.ts";
import { googleOAuthConfig } from "./server-config.ts";
import { database } from "./server-runtime.ts";

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const randomValue = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (value: string) => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

const secureCookie = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false" ? "; Secure" : "";
export const googleStateCookie = (state: string) => `room_google_state=${state}; Path=/api/auth/google; HttpOnly${secureCookie}; SameSite=Lax; Max-Age=600`;
export const clearGoogleStateCookie = `room_google_state=; Path=/api/auth/google; HttpOnly${secureCookie}; SameSite=Lax; Max-Age=0`;

function cookieValue(request: Request, name: string) {
  return (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export async function beginGoogleLogin(request: Request) {
  await ensureStore();
  const config = googleOAuthConfig();
  if (!config.enabled) throw new Error("Google Sign-In не настроен.");
  const tenant = await tenantForRequest(request);
  const origin = new URL(request.url).origin;
  const redirectUri = config.redirectUri || `${origin}/api/auth/google/callback`;
  const state = randomValue();
  const verifier = randomValue();
  const challenge = await sha256(verifier);
  const now = new Date();
  await database.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now.toISOString()).run();
  await database.prepare("INSERT INTO oauth_states (state_hash, code_verifier, tenant_id, redirect_uri, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await sha256(state), verifier, tenant.id, redirectUri, new Date(now.getTime() + 10 * 60 * 1000).toISOString(), now.toISOString()).run();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
  return { url: url.toString(), state };
}

type GoogleTokenInfo = { sub?: string; email?: string; email_verified?: string; given_name?: string; family_name?: string; aud?: string; iss?: string; exp?: string; error_description?: string };

export async function resolveGoogleIdentity(info: { sub: string; email: string; given_name?: string; family_name?: string }) {
  await ensureStore();
  const email = normalizeEmail(info.email);
  const now = new Date().toISOString();
  const identity = await database.prepare("SELECT user_id FROM auth_identities WHERE provider = 'google' AND provider_user_id = ?").bind(info.sub).first<{ user_id: string }>();
  if (identity) return identity.user_id;
  let user = await database.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (!user) {
    user = { id: crypto.randomUUID() };
    const inaccessible = randomValue();
    await database.prepare("INSERT INTO users (id, email, password_hash, password_salt, password_algorithm, password_iterations, global_role, first_name, last_name, created_at) VALUES (?, ?, ?, ?, 'google-only', 600000, 'user', ?, ?, ?)")
      .bind(user.id, email, inaccessible, randomValue(), (info.given_name || "").slice(0, 80), (info.family_name || "").slice(0, 80), now).run();
  }
  try {
    await database.prepare("INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at) VALUES (?, ?, 'google', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, info.sub, email, now, now).run();
  } catch (error) {
    // A concurrent callback may have linked the same verified Google identity.
    const concurrent = await database.prepare("SELECT user_id FROM auth_identities WHERE provider = 'google' AND provider_user_id = ?").bind(info.sub).first<{ user_id: string }>();
    if (!concurrent) throw error;
    return concurrent.user_id;
  }
  return user.id;
}

export async function finishGoogleLogin(request: Request, code: string, state: string) {
  await ensureStore();
  const config = googleOAuthConfig();
  if (!config.enabled) throw new Error("Google Sign-In не настроен.");
  if (!code || !state || cookieValue(request, "room_google_state") !== state) throw new Error("Некорректное состояние Google OAuth.");
  const stateHash = await sha256(state);
  const oauthState = await database.prepare("SELECT code_verifier, redirect_uri, expires_at FROM oauth_states WHERE state_hash = ?").bind(stateHash).first<{ code_verifier: string; redirect_uri: string; expires_at: string }>();
  if (!oauthState || oauthState.expires_at <= new Date().toISOString()) throw new Error("Google OAuth-сессия истекла.");
  await database.prepare("DELETE FROM oauth_states WHERE state_hash = ?").bind(stateHash).run();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: oauthState.redirect_uri, grant_type: "authorization_code", code_verifier: oauthState.code_verifier }) });
  const tokenPayload = await tokenResponse.json() as { id_token?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenPayload.id_token) throw new Error(tokenPayload.error_description || "Google не подтвердил вход.");
  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenPayload.id_token)}`);
  const info = await infoResponse.json() as GoogleTokenInfo;
  if (!infoResponse.ok || !info.sub || !info.email || info.email_verified !== "true" || info.aud !== config.clientId || !["accounts.google.com", "https://accounts.google.com"].includes(info.iss || "") || Number(info.exp || 0) * 1000 <= Date.now()) throw new Error(info.error_description || "Google identity не прошла проверку.");
  const userId = await resolveGoogleIdentity({ sub: info.sub, email: info.email, given_name: info.given_name, family_name: info.family_name });
  const appUser = await userForRequest(request, userId);
  if (!appUser) throw new Error("Не удалось загрузить глобальный аккаунт.");
  const token = await createSession(appUser);
  return { user: appUser, cookie: sessionCookie(token) };
}
