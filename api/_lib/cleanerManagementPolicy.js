/**
 * Separate real-world cleaner input rules from staging-only restrictions.
 * Nothing here enables production mutations: the existing QA RPC, environment
 * allowlist, and current 30-day login branch remain staging-only.
 */
const QA_PREFIX="【權限驗收】";
const MANAGEMENT_ACTIONS=new Set(["create","rename","disable"]);
const MAX_NAME_LENGTH=80;

export function normalizeCleanerName(value){
  if(typeof value!=="string")return null;
  const name=value.trim();
  if(!name || name.length>MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name))
    return null;
  return name;
}
export function validateCleanerManagementInput({
  method,action,name,cleanerId,mode="qa",
}={}){
  if(mode!=="qa"&&mode!=="production-planning")
    return {ok:false,error:"Unsupported mode"};
  if(method!=="POST"&&method!=="PATCH")
    return {ok:false,error:"Unsupported method"};
  const selectedAction=method==="POST"?"create":action;
  if(!MANAGEMENT_ACTIONS.has(selectedAction)||
    (method==="POST"&&action!==undefined&&action!=="create")||
    (method==="PATCH"&&selectedAction==="create"))
    return {ok:false,error:"Invalid management action"};
  if(selectedAction!=="create"&&(!Number.isSafeInteger(cleanerId)||cleanerId<1))
    return {ok:false,error:"Invalid cleaner ID"};
  let safeName="";
  if(selectedAction!=="disable"){
    safeName=normalizeCleanerName(name);
    if(!safeName)return {ok:false,error:"Invalid cleaner name"};
    // QA continues to permit *only* dedicated test identities.
    if(mode==="qa"&&(!safeName.startsWith(QA_PREFIX)||
       safeName.length<=QA_PREFIX.length))
      return {ok:false,error:"QA test names only"};
  }
  return {ok:true,action:selectedAction,name:safeName,
    cleanerId:selectedAction==="create"?null:cleanerId,
    // Planning is *never* permission to write to production.
    executableInQa:mode==="qa",
  };
}
