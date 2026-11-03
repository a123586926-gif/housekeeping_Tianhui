import { adminDb, getSession, json } from "../_lib/auth.js";

// No PIN values are ever sent to the browser.
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    const { data, error } = await adminDb().from("cleaners")
      .select("id, name, is_active, created_at").order("id", { ascending: true });
    if (error) throw error;
    return json(res, 200, { cleaners: data || [] });
  } catch {
    return json(res, 503, { error: "Unable to read cleaners" });
  }
}
