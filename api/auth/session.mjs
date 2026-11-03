import { getSession, json } from "../../server/auth-core.mjs";

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    try {
      const session = await getSession(request);
      if (!session) return json({ authenticated: false });
      return json({
        authenticated: true,
        user: session.user,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error("Auth session unavailable:", error?.message || "Unknown");
      return json({ error: "Authentication is temporarily unavailable" }, 503);
    }
  }
};
