import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { parseCleanerCreate } from "../_lib/cleanerValidation.js";

// Admin-only. PIN is transmitted over HTTPS and hashed inside the transactional
// Supabase RPC; never return it in a response or write it to an application log.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    const payload = parseCleanerCreate(req.body);
    if (!payload) return json(res, 400, { error: "Invalid name or PIN" });
    const { data, error } = await adminDb().rpc("hk_create_cleaner", {
      p_name: payload.name, p_pin: payload.pin,
    });
    if (error) throw error;
    if (!Number.isSafeInteger(Number(data)) || Number(data) <= 0) {
      throw new Error("Invalid cleaner ID from database");
    }
    return json(res, 201, { ok: true, id: Number(data) });
  } catch {
    return json(res, 503, { error: "Unable to create cleaner" });
  }
}
