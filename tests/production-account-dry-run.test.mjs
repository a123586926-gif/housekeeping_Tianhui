import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareLegacyCleanerMigration,verifyProvisioningTransition,
} from "../server/production-account-dry-run.mjs";

const fixture=()=>Array.from({length:6},(_,index)=>({
  id:101+index,name:`Mock Cleaner ${index+1}`,is_active:true,
  has_legacy_pin:index<3,
}));

test("six legacy cleaners retain IDs, but no account can log in by default",()=>{
  const out=prepareLegacyCleanerMigration(fixture(),[
    {room_id:5501,cleaner_id:101},{room_id:5502,cleaner_id:null},
  ]);
  assert.equal(out.safeForDryRun,true);
  assert.equal(out.totalCleaners,6);
  assert.equal(out.legacyPinsPresent,3);
  assert.equal(out.legacyPinsMissing,3);
  assert.equal(out.assignedCount,1);
  assert.equal(out.productionChangesPerformed,false);
  assert.equal(out.canActivateAccountsAutomatically,false);
  assert.equal(out.accounts.every(x=>x.authActive===false&&!x.newCredentialProvisioned),true);
  assert.equal(out.accounts[0].userId,"cleaner-101");
  assert.equal(out.accounts[0].role,"cleaner");
  assert.equal(out.accounts.filter(x=>x.legacyPinPresent).length,3);
  assert.equal(out.accounts.some(x=>"pin" in x||"pin_hash" in x),false);
});

test("old PIN presence alone never enables the new auth account",()=>{
  const account=prepareLegacyCleanerMigration(fixture()).accounts[0];
  assert.equal(account.legacyPinPresent,true);
  assert.equal(verifyProvisioningTransition(account,{userId:account.userId}).allowed,false);
  assert.equal(verifyProvisioningTransition(account,{
    userId:account.userId,authorizedByAdmin:true,strongPinHashedServerSide:true,
    savedInCredentialStore:true,businessRecordStillActive:true,
  }).allowed,true);
});

test("missing legacy PIN account requires same explicit secure provisioning",()=>{
  const account=prepareLegacyCleanerMigration(fixture()).accounts[5];
  assert.equal(account.legacyPinPresent,false);
  assert.equal(verifyProvisioningTransition(account,{
    userId:account.userId,authorizedByAdmin:true,strongPinHashedServerSide:false,
    savedInCredentialStore:true,businessRecordStillActive:true,
  }).allowed,false);
});

test("reject plaintext PINs, hashes, tokens and extra fields rather than logging them",()=>{
  for(const field of ["pin","pin_hash","password","token","notes"]){
    assert.throws(()=>prepareLegacyCleanerMigration([
      {...fixture()[0],[field]:"SENSITIVE-UNEXPECTED"},
    ]),TypeError);
  }
});

test("reject duplicate IDs or normalized names",()=>{
  const dupId=fixture();dupId[1].id=dupId[0].id;
  const dupName=fixture();dupName[1].name=dupName[0].name.toUpperCase();
  assert.equal(prepareLegacyCleanerMigration(dupId).safeForDryRun,false);
  assert.equal(prepareLegacyCleanerMigration(dupName).safeForDryRun,false);
});

test("reject orphaned room assignments, invalid identifiers or invalid account metadata",()=>{
  assert.equal(prepareLegacyCleanerMigration(fixture(),[
    {room_id:500,cleaner_id:999999},
  ]).safeForDryRun,false);
  const badId=fixture();badId[0].id=-1;
  assert.equal(prepareLegacyCleanerMigration(badId).safeForDryRun,false);
  const invalidFlag=fixture();invalidFlag[0].has_legacy_pin="yes";
  assert.equal(prepareLegacyCleanerMigration(invalidFlag).safeForDryRun,false);
});

test("reject silent role elevation or reactivation of existing accounts",()=>{
  const account=prepareLegacyCleanerMigration(fixture()).accounts[0];
  assert.throws(()=>verifyProvisioningTransition({...account,role:"admin"},{}),TypeError);
  assert.throws(()=>verifyProvisioningTransition({...account,authActive:true},{}),TypeError);
});
