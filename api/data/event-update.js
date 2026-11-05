import { json } from "../_lib/auth.js";
import { createEventHandler } from "./event-create.js";

// Compatibility endpoint for older clients. Delegate to the same event
// authorization and cleaning-category invariants as the primary route.
// Never maintain a parallel direct-table update implementation.
export function createLegacyEventUpdateHandler({
  eventHandler=createEventHandler({releaseScope:process.env.VERCEL_ENV==="production"?"production":"qa"}),
}={}) {
  return async function handler(req,res) {
    if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
    const delegated=Object.create(req);
    delegated.method="PATCH";
    delegated.body={...req.body,eventId:req.body?.id};
    return eventHandler(delegated,res);
  };
}

export default createLegacyEventUpdateHandler();
