/**
 * Pure backup/restore readiness gate.
 * No network access, no database credentials, no backup creation or restoration.
 * Only aggregated counts and proof flags should be passed. Fail closed.
 */
const COUNTERS = ["events", "eventRooms", "roomCatalog", "cleaners", "photoObjects", "photoBytes", "assignedRooms", "photoLinkedRooms"];
function nonnegativeInt(n){return Number.isSafeInteger(n)&&n>=0;}
function validCounts(c){return c && typeof c==="object" && !Array.isArray(c) &&
  Object.keys(c).length===COUNTERS.length &&
  COUNTERS.every(k=>nonnegativeInt(c[k])) &&
  Object.keys(c).every(k=>COUNTERS.includes(k));}
function validFile(f){return f && typeof f==="object" && !Array.isArray(f) &&
  Object.keys(f).length===3 && typeof f.id==="string" && /^[a-z0-9_-]{1,48}$/.test(f.id) &&
  nonnegativeInt(f.bytes) && typeof f.sha256==="string" && /^[a-f0-9]{64}$/.test(f.sha256);}
function fail(message){return {ready:false,reasons:[message]};}
/**
 * A restore must happen to a distinct isolated target. Reports are supplied
 * from an operator-verified backup-and-restore process, not created here.
 */
export function assessRestoreReadiness(input){
  if(!input || typeof input!=="object" || Array.isArray(input))throw new TypeError("Readiness evidence required");
  const {
    baseline, restored, sourceProjectRef, isolatedTargetProjectRef,
    logicalDatabaseBackupVerified=false, databaseRestoreVerified=false,
    storageBytesBackupVerified=false, storageRestoreVerified=false,
    schemaAndPoliciesVerified=false, credentialsProtected=false,
    restoredFiles=[], sourceFiles=[], appRollbackVerified=false,
    databaseRollbackVerified=false, maintenanceWindowApproved=false,
  }=input;
  if(!validCounts(baseline)||!validCounts(restored))return fail("Invalid aggregate counters");
  const reasons=[];
  if(!sourceProjectRef || !isolatedTargetProjectRef || sourceProjectRef===isolatedTargetProjectRef)
    reasons.push("Restore destination must be verified and isolated from source");
  for(const k of COUNTERS){
    if(baseline[k]!==restored[k])reasons.push(`Restored ${k} count differs from source checkpoint`);
  }
  if(!logicalDatabaseBackupVerified)reasons.push("Database backup not independently verified");
  if(!databaseRestoreVerified)reasons.push("Database restore not successfully tested");
  if(!storageBytesBackupVerified)reasons.push("Storage file bytes backup not verified");
  if(!storageRestoreVerified)reasons.push("Storage restore not successfully tested");
  if(!schemaAndPoliciesVerified)reasons.push("Schema, constraints, policies and sequences not verified");
  if(!credentialsProtected)reasons.push("Sensitive data backup protection not confirmed");
  if(!appRollbackVerified)reasons.push("Application rollback not rehearsed");
  if(!databaseRollbackVerified)reasons.push("Database rollback not rehearsed");
  if(!maintenanceWindowApproved)reasons.push("Coordinated cutover window not approved");
  if(!Array.isArray(sourceFiles)||!Array.isArray(restoredFiles) ||
     !sourceFiles.every(validFile)||!restoredFiles.every(validFile)){
    reasons.push("Invalid or missing SHA-256 file manifest");
  }else{
    const source=new Map();
    const destination=new Map();
    for(const entry of sourceFiles){
      if(source.has(entry.id))reasons.push("Duplicate backup file identifiers");
      source.set(entry.id,entry);
    }
    for(const entry of restoredFiles){
      if(destination.has(entry.id))reasons.push("Duplicate restored file identifiers");
      destination.set(entry.id,entry);
    }
    if(source.size!==baseline.photoObjects||destination.size!==restored.photoObjects)
      reasons.push("Storage manifests do not match object counts");
    for(const [id,f] of source){
      const restoredFile=destination.get(id);
      if(!restoredFile || restoredFile.bytes!==f.bytes || restoredFile.sha256!==f.sha256)
        reasons.push(`Missing or checksum-mismatched Storage object: ${id}`);
    }
    for(const id of destination.keys())if(!source.has(id))reasons.push(`Unexpected restored Storage object: ${id}`);
    if([...source.values()].reduce((sum,f)=>sum+f.bytes,0)!==baseline.photoBytes)
      reasons.push("Source file manifest byte total differs from database inventory");
  }
  return {ready:reasons.length===0,reasons,sourceUnchanged:true,dryRunOnly:true};
}
