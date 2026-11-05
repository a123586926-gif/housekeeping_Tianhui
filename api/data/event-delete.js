import { json } from "../_lib/auth.js";
import { createEventHandler } from "./event-create.js";

// Compatibility endpoint for older clients. Reuse the primary deletion guard,
// including photo-evidence protection and atomic production deletion RPC.
export function createLegacyEventDeleteHandler({
  eventHandler=createEventHandler({releaseScope:process.env.VERCEL_ENV==="production"?"production":"qa"}),
}={}) {
  return async function handler(req,res) {
    if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
    const delegated=Object.create(req);
    delegated.method="DELETE";
    delegated.body={...req.body,eventId:req.body?.id};
    return eventHandler(delegated,res);
  };
}

export default createLegacyEventDeleteHandler();
