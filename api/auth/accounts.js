import { adminDb, json } from "../_lib/auth.js";

// Public list of login-picker labels only. Never return PINs or password hashes.
// Production enabling requires account migration and anti-enumeration review.
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const { data, error } = await adminDb().from("hk_auth_accounts")
      .select("user_id, display_name")
      .eq("active", true)
      .order("user_id", { ascending: true });
    if (error) throw error;
    return json(res, 200, {
      users: (data || []).map(row => ({ id: row.user_id, name: row.display_name })),
    });
  } catch {
    return json(res, 503, { error: "Account directory unavailable" });
  }
}
