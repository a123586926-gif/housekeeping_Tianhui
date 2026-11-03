import {
  json, sameOrigin, serviceClient, validPin, validUserId,
  newSessionToken, hashToken, sessionCookie, SESSION_SECONDS,
} from "../../server/auth-core.mjs";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return json({ error: "Expected application/json" }, 415);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const userId = body?.userId;
    const pin = body?.pin;
    if (!validUserId(userId) || !validPin(pin)) return json({ error: "Invalid credentials" }, 401);

    try {
      const db = serviceClient();
      const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80);
      // The DB functions serialize failed attempts and reject attempts during lockout.
      const key = hashToken(userId + "|" + ip);
      const { data: allowed, error: allowedError } = await db.rpc("housekeeping_auth_allow_attempt", { p_key: key });
      if (allowedError) throw allowedError;
      if (allowed !== true) return json({ error: "Too many attempts. Try again later." }, 429);

      const { data, error } = await db.rpc("housekeeping_verify_pin", {
        p_user_id: userId,
        p_pin: pin,
      });
      if (error) throw error;
      const person = Array.isArray(data) ? data[0] : null;

      const { error: recordError } = await db.rpc("housekeeping_auth_record_attempt", {
        p_key: key, p_success: Boolean(person),
      });
      if (recordError) throw recordError;
      if (!person) return json({ error: "Invalid credentials" }, 401);

      const token = newSessionToken();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + SESSION_SECONDS * 1000);
      const { error: sessionError } = await db.from("housekeeping_auth_sessions").insert({
        token_hash: hashToken(token),
        user_id: person.user_id,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });
      if (sessionError) throw sessionError;

      return json({
        authenticated: true,
        user: { id: person.user_id, name: person.display_name, role: person.role },
        expiresAt: expiresAt.toISOString(),
      }, 200, { "Set-Cookie": sessionCookie(token) });
    } catch (error) {
      console.error("Auth login unavailable:", error?.message || "Unknown");
      return json({ error: "Authentication is temporarily unavailable" }, 503);
    }
  }
};
