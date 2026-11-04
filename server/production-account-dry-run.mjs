/**
 * PREPRODUCTION DRY RUN ONLY — no database or network calls, no credential
 * hashing, no INSERT/UPDATE/DELETE and no automatic account activation.
 *
 * Input is sanitized metadata only. DO NOT supply actual cleaners.pin,
 * password hashes, personally identifying notes, or customer information.
 * The authorized administrator must provision each fresh PIN separately using
 * a privileged, server-side flow after production approval and backups.
 */
const allowedFields=new Set(["id","name","is_active","has_legacy_pin"]);
const allowedAssignmentFields=new Set(["room_id","cleaner_id"]);
const forbiddenCredentialFields=new Set(["pin","password","pin_hash","old_pin","new_pin","token","secret"]);
const idOf=id=>`cleaner-${id}`;

function validId(value){
  return Number.isSafeInteger(value)&&value>0;
}
function failOnCredentialInput(input,label,allowed){
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new TypeError(`${label}: sanitized object required`);
  const keys=Object.keys(input);
  if(keys.some(key=>forbiddenCredentialFields.has(key.toLowerCase())))
    throw new TypeError(`${label}: credential data prohibited`);
  if(keys.some(key=>!allowed.has(key)))
    throw new TypeError(`${label}: unexpected field; supply metadata only`);
}
function summarize(record){
  return {
    userId:idOf(record.id),
    cleanerId:record.id,
    role:"cleaner",
    displayName:record.name.trim(),
    businessActive:record.is_active,
    legacyPinPresent:record.has_legacy_pin,
    authActive:false,
    newCredentialProvisioned:false,
    migrationStatus:"requires_individual_provisioning",
  };
}

export function prepareLegacyCleanerMigration(cleaners,assignments=[]){
  if(!Array.isArray(cleaners)||!Array.isArray(assignments))
    throw new TypeError("Sanitized cleaner and assignment arrays are required");
  const errors=[];
  const ids=new Set(),names=new Set();
  const summaries=[];
  for(const input of cleaners){
    failOnCredentialInput(input,"Cleaner",allowedFields);
    if(!validId(input.id))errors.push("Invalid cleaner ID");
    if(ids.has(input.id))errors.push("Duplicate cleaner ID");
    ids.add(input.id);
    if(typeof input.name!=="string"||!input.name.trim()||input.name.length>100)
      errors.push("Invalid cleaner display name");
    else{
      const normalized=input.name.trim().toLocaleLowerCase("en");
      if(names.has(normalized))errors.push("Duplicate normalized cleaner name");
      names.add(normalized);
    }
    if(typeof input.is_active!=="boolean"||typeof input.has_legacy_pin!=="boolean")
      errors.push("Missing required boolean metadata");
    // Never copy any legacy PIN into output; all login identities start disabled.
    if(validId(input.id)&&typeof input.name==="string"&&
      typeof input.is_active==="boolean"&&typeof input.has_legacy_pin==="boolean")
      summaries.push(summarize(input));
  }
  let assignedCount=0;
  for(const item of assignments){
    failOnCredentialInput(item,"Assignment",allowedAssignmentFields);
    if(!validId(item.room_id))errors.push("Invalid room assignment ID");
    if(item.cleaner_id!==null&&item.cleaner_id!==undefined){
      assignedCount++;
      if(!validId(item.cleaner_id)||!ids.has(item.cleaner_id))
        errors.push("Orphaned room assignment cleaner ID");
    }
  }
  summaries.sort((a,b)=>a.cleanerId-b.cleanerId);
  return {
    safeForDryRun:errors.length===0,
    productionChangesPerformed:false,
    canActivateAccountsAutomatically:false,
    totalCleaners:cleaners.length,
    legacyPinsPresent:cleaners.filter(x=>x?.has_legacy_pin===true).length,
    legacyPinsMissing:cleaners.filter(x=>x?.has_legacy_pin===false).length,
    assignedCount,
    errors,
    accounts:summaries,
    instructions:[
      "Preserve existing cleaners IDs and names; do not modify room assignments",
      "Create disabled login identities with a random unusable hash; do not carry forward old PINs",
      "Authorize and set a new strong PIN for each individual through a secure privileged channel",
      "Enable login only after the new PIN is hashed and provisioned, even if the business record is active",
      "Explicitly identify and provision an administrative account separately",
      "Keep old production read/write paths unchanged until audited coordinated cutover",
    ],
  };
}

export function verifyProvisioningTransition(account,transition){
  if(!account||account.role!=="cleaner"||!validId(account.cleanerId)||
    account.userId!==idOf(account.cleanerId)||account.authActive!==false||
    account.newCredentialProvisioned!==false)
    throw new TypeError("Expected untouched disabled cleaner login identity");
  if(!transition||transition.userId!==account.userId||
    transition.authorizedByAdmin!==true||
    transition.strongPinHashedServerSide!==true||
    transition.savedInCredentialStore!==true||
    transition.businessRecordStillActive!==true)
    return {allowed:false,reason:"Individual authorized provisioning not completed"};
  return {allowed:true,reason:"Eligible for activation after authoritative server recheck"};
}
