import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_SECONDS, newSessionToken, hashToken,
  parseSessionCookie, sessionCookie, clearCookie,
  sameOrigin, validPin, validUserId,
} from "../server/auth-core.mjs";

test("session is fixed at exactly 30 days", () => {
  assert.equal(SESSION_SECONDS, 30 * 24 * 60 * 60);
});

test("random session token has expected format and hashed representation", () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.match(hashToken(a), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken(a), a);
});

test("secure cookie has HttpOnly, Secure and SameSite flags", () => {
  const token = newSessionToken();
  const cookie = sessionCookie(token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=2592000/);
  assert.equal(parseSessionCookie(cookie), token);
  assert.match(clearCookie(), /Max-Age=0/);
  assert.equal(parseSessionCookie(clearCookie()), null);
});

test("malformed and missing cookies cannot create a session", () => {
  assert.equal(parseSessionCookie(""), null);
  assert.equal(parseSessionCookie("__Host-housekeeping_session=admin"), null);
});

test("cross-site or missing Origin is refused for mutations", () => {
  const origin = "https://housekeeping.example.test";
  assert.equal(sameOrigin(new Request(origin + "/api/auth/login", { headers: { Origin: origin } })), true);
  assert.equal(sameOrigin(new Request(origin + "/api/auth/login", { headers: { Origin: "https://evil.test" } })), false);
  assert.equal(sameOrigin(new Request(origin + "/api/auth/login")), false);
  assert.equal(sameOrigin(new Request("http://localhost/api/auth/login", { headers: { Origin: "http://localhost" } })), false);
});

test("PIN and user identifiers accept only bounded legacy forms", () => {
  assert.equal(validPin("1234"), true);
  assert.equal(validPin("123"), false);
  assert.equal(validPin("1234abc"), false);
  assert.equal(validUserId("admin"), true);
  assert.equal(validUserId("cleaner-35"), true);
  assert.equal(validUserId("cleaner-0"), false);
  assert.equal(validUserId("../admin"), false);
});
