import test from "node:test";
import assert from "node:assert/strict";
import {assessRestoreReadiness} from "../server/restore-readiness.mjs";
const file={id:"legacy-object-1",bytes:1589759,sha256:"a".repeat(64)};
const counts={events:2,eventRooms:168,roomCatalog:5,cleaners:6,
 photoObjects:1,photoBytes:1589759,assignedRooms:1,photoLinkedRooms:0};
function fixture(){
  return {baseline:{...counts},restored:{...counts},
    sourceProjectRef:"fixture-primary",isolatedTargetProjectRef:"fixture-restore",
    logicalDatabaseBackupVerified:true,databaseRestoreVerified:true,
    storageBytesBackupVerified:true,storageRestoreVerified:true,
    schemaAndPoliciesVerified:true,credentialsProtected:true,
    appRollbackVerified:true,databaseRollbackVerified:true,
    maintenanceWindowApproved:true,
    sourceFiles:[{...file}],restoredFiles:[{...file}]};
}
test("same aggregate counts and independently verified database + photo restoration pass",()=>{
 const r=assessRestoreReadiness(fixture());
 assert.equal(r.ready,true);
 assert.equal(r.sourceUnchanged,true);
 assert.equal(r.dryRunOnly,true);
});
test("current preproduction state with no backup proof is NO-GO",()=>{
 const f=fixture();
 for(const k of ["logicalDatabaseBackupVerified","databaseRestoreVerified",
   "storageBytesBackupVerified","storageRestoreVerified",
   "schemaAndPoliciesVerified","appRollbackVerified",
   "databaseRollbackVerified","maintenanceWindowApproved"])f[k]=false;
 const r=assessRestoreReadiness(f);
 assert.equal(r.ready,false);
 assert.ok(r.reasons.length>=8);
});
test("Storage metadata alone is never sufficient without file manifest",()=>{
 const f=fixture();f.sourceFiles=[];
 assert.equal(assessRestoreReadiness(f).ready,false);
});
test("missing photo, mismatch in bytes or SHA-256 block cutover",()=>{
 const noFile=fixture();noFile.restoredFiles=[];
 assert.equal(assessRestoreReadiness(noFile).ready,false);
 const badHash=fixture();badHash.restoredFiles[0].sha256="b".repeat(64);
 assert.equal(assessRestoreReadiness(badHash).ready,false);
 const badBytes=fixture();badBytes.restoredFiles[0].bytes--;
 assert.equal(assessRestoreReadiness(badBytes).ready,false);
});
test("mutating production instead of restoring to an isolated project is blocked",()=>{
 const f=fixture();f.isolatedTargetProjectRef=f.sourceProjectRef;
 assert.equal(assessRestoreReadiness(f).ready,false);
});
test("changed room or assignment counts block cutover",()=>{
 const f=fixture();f.restored.eventRooms=167;
 assert.equal(assessRestoreReadiness(f).ready,false);
 const g=fixture();g.restored.assignedRooms=0;
 assert.equal(assessRestoreReadiness(g).ready,false);
});
test("duplicate file identities and invalid metadata cannot pass",()=>{
 const f=fixture();f.sourceFiles.push({...file});
 assert.equal(assessRestoreReadiness(f).ready,false);
 const g=fixture();g.sourceFiles[0].sha256="invalid";
 assert.equal(assessRestoreReadiness(g).ready,false);
});
test("no real backup is created by this evaluator",()=>{
 const f=fixture(),serialized=JSON.stringify(f);
 const r=assessRestoreReadiness(f);
 assert.equal(r.dryRunOnly,true);
 assert.equal(JSON.stringify(f),serialized);
});
