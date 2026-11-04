import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validateCleanerManagementInput } from "../_lib/cleanerManagementPolicy.js";

// No PIN values are ever sent to the browser.
export default async function handler(req, res) {
  if (!["GET","POST","PATCH"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (req.method !== "GET" && !allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    if (req.method !== "GET") {
      // Temporary staging-only management RPC. All new accounts start disabled
      // with a random, unrecoverable credential. Real staff PIN provisioning
      // requires a separately reviewed endpoint before production rollout.
      const parsed = validateCleanerManagementInput({
        method: req.method,
        action: req.body?.action,
        name: req.body?.name,
        cleanerId: req.body?.cleanerId,
        mode: "qa",
      });
      if (!parsed.ok || !parsed.executableInQa)
        return json(res, 400, { error: parsed.error || "QA restrictions apply" });
      const {action, cleanerId:id, name} = parsed;
      const { data: managedId, error: mutationError } = await adminDb().rpc("hk_qa_manage_cleaner", {
        p_action: action,
        p_cleaner_id: action === "create" ? null : id,
        p_name: name,
      });
      if (mutationError) return json(res, 400, { error: "Cleaner management rejected" });
      return json(res, req.method === "POST" ? 201 : 200, {
        ok: true, cleanerId: Number(managedId),
      });
    }
    const { data, error } = await adminDb().from("cleaners")
      .select("id, name, is_active, created_at").order("id", { ascending: true });
    if (error) throw error;
    return json(res, 200, { cleaners: data || [] });
  } catch {
    return json(res, 503, { error: "Unable to read cleaners" });
  }
}
