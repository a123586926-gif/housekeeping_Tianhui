import {validateCleanerManagementInput} from "./cleanerManagementPolicy.js";

/**
 * QA-only server management contract. The database RPC is responsible for
 * atomic cleaner/account/session changes, including revoking every session
 * when a cleaner is disabled. Never invoke the RPC from a client browser.
 */
export async function manageQaCleaner({role,method,body={},rpc}){
  if(role!=="admin")return {status:403,body:{error:"Admin required"}};
  const parsed=validateCleanerManagementInput({
    method,action:body?.action,name:body?.name,
    cleanerId:body?.cleanerId,mode:"qa",
  });
  if(!parsed.ok||!parsed.executableInQa)
    return {status:400,body:{error:parsed.error||"QA restrictions apply"}};
  if(typeof rpc!=="function")throw new TypeError("Server-only RPC adapter required");
  const {data,error}=await rpc("hk_qa_manage_cleaner",{
    p_action:parsed.action,
    p_cleaner_id:parsed.cleanerId,
    p_name:parsed.name,
  });
  if(error||!Number.isSafeInteger(Number(data))||Number(data)<=0)
    return {status:400,body:{error:"Cleaner management rejected"}};
  return {
    status:method==="POST"?201:200,
    body:{ok:true,cleanerId:Number(data)},
  };
}

/**
 * A fail-closed check for the database RPC's observable postconditions.
 * Call after QA disable to ensure an account is inactive and there are
 * no live sessions. A failed check is a verification failure, not a reason
 * to re-enable or modify the account.
 */
export function verifyDisabledCleaner({cleaner,account,sessions}={}){
  if(!cleaner||!account||!Array.isArray(sessions))return false;
  if(cleaner.is_active!==false||account.active!==false)return false;
  return sessions.every(s=>s.revoked_at!=null||Date.parse(s.expires_at)<=Date.now());
}
