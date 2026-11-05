import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { manageQaCleaner } from "../_lib/qaCleanerManagement.js";
import {validateCleanerManagementInput} from "../_lib/cleanerManagementPolicy.js";

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
      if (process.env.VERCEL_ENV==="production") {
        const parsed=validateCleanerManagementInput({
          method:req.method,action:req.body?.action,name:req.body?.name,
          cleanerId:req.body?.cleanerId,mode:"production-planning",
        });
        if(!parsed.ok)return json(res,400,{error:parsed.error||"Invalid cleaner data"});
        const {data,error}=await dbFactory().rpc("hk_manage_cleaner",{
          p_action:parsed.action,p_cleaner_id:parsed.cleanerId,p_name:parsed.name,
        });
        if(error||!Number.isSafeInteger(Number(data))||Number(data)<=0)
          return json(res,409,{error:"Cleaner operation rejected"});
        return json(res,req.method==="POST"?201:200,{
          ok:true,cleanerId:Number(data),
          requiresPinSetup:parsed.action==="create",
        });
      }
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
