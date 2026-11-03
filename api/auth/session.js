import { getSession, json } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 200, { authenticated: false });
    return json(res, 200, {
      authenticated: true, user: session.user, expiresAt: session.expiresAt,
    });
  } catch {
    return json(res, 503, { error: "Authentication service unavailable" });
  }
}
