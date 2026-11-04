import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { manageQaCleaner } from "../_lib/qaCleanerManagement.js";

// No PIN values are ever sent to the browser.
export function createCleanersHandler({dbFactory=adminDb,sessionReader=getSession,originAllowed=allowSameOrigin}={}) {
  return async function handler(req, res) {
  if (!["GET","POST","PATCH"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (req.method !== "GET" && !originAllowed(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await sessionReader(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user?.role !== "admin" || session.user.id !== "admin") return json(res, 403, { error: "Admin required" });
    if (req.method !== "GET") {
      // Temporary staging-only management RPC. All new accounts start disabled
      // with a random, unrecoverable credential. Real staff PIN provisioning
      // requires a separately reviewed endpoint before production rollout.
      const result = await manageQaCleaner({
        role: session.user.role,
        method: req.method,
        body: req.body,
        rpc: (name, args) => dbFactory().rpc(name, args),
      });
      return json(res, result.status, result.body);
    }
    const { data, error } = await dbFactory().from("cleaners")
      .select("id, name, is_active, created_at").order("id", { ascending: true });
    if (error) throw error;
    return json(res, 200, { cleaners: data || [] });
  } catch {
    return json(res, 503, { error: "Unable to read cleaners" });
  }
  };
}

export default createCleanersHandler();
