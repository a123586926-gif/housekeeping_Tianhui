import { getSession, json, sameOrigin, serviceClient, clearCookie } from "../../server/auth-core.mjs";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
    try {
      const db = serviceClient();
      const session = await getSession(request, db);
      if (session) {
        const { error } = await db.from("housekeeping_auth_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", session.tokenHash);
        if (error) throw error;
      }
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
    } catch (error) {
      console.error("Auth logout unavailable:", error?.message || "Unknown");
      return json({ error: "Logout failed" }, 503);
    }
  }
};
