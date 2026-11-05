import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";

const validId=value=>typeof value==="number" && Number.isSafeInteger(value) && value>0;
const validText=(value,max)=>typeof value==="string" && value.length<=max;

export function createGuestMoveHandler({
  dbFactory=adminDb,sessionReader=getSession,originAllowed=allowSameOrigin,
}={}) {
  return async function handler(req,res) {
    if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
    if(!originAllowed(req))return json(res,403,{error:"Origin rejected"});
    try {
      const session=await sessionReader(req);
      if(!session)return json(res,401,{error:"Not authenticated"});
      if(session.user?.role!=="admin" || session.user?.id!=="admin")
        return json(res,403,{error:"Admin only"});
      const {fromRoomId,toRoomId,name,expectedFrom,expectedTo}=req.body||{};
      if(!validId(fromRoomId)||!validId(toRoomId)||fromRoomId===toRoomId||
         !validText(name,100)||!name.trim()||name.trim()!==name||
         /[\n\r\t、,，]/.test(name)||!validText(expectedFrom,3000)||
         !validText(expectedTo,3000))
        return json(res,400,{error:"Invalid guest transfer request"});
      const db=dbFactory();
      const {data,error}=await db.rpc("hk_move_guest_atomic",{
        p_from_room_id:fromRoomId,p_to_room_id:toRoomId,p_name:name,
        p_expected_from:expectedFrom,p_expected_to:expectedTo,
      });
      if(error)return json(res,409,{error:"Room changed, destination already has this guest, or movement was rejected. Refresh and retry."});
      if(data!==true)return json(res,409,{error:"Guest transfer was not confirmed"});
      return json(res,200,{ok:true});
    }catch(error){
      return json(res,500,{error:"Unable to move guest safely"});
    }
  };
}
export default createGuestMoveHandler();
