import test from "node:test";
import assert from "node:assert/strict";
import {auditPhotoMigration} from "../server/production-photo-migration-audit.mjs";

const base=()=>({
  sourceBucket:"legacy-cleaning-photos",sourcePublic:true,
  destinationBucket:"new-private-cleaning-photos",destinationPublic:false,
  objects:[{path:"room-12/flooring/fictional.jpg",sizeBytes:120,mimeType:"image/jpeg"}],
  rooms:[{id:12,floor_photo:"room-12/flooring/fictional.jpg"}],
  backupVerified:true,destinationAuthorizationVerified:true,
});

test("private destination plus verified backup and matching reference can be staged",()=>{
  const result=auditPhotoMigration(base());
  assert.equal(result.dryRunOnly,true);
  assert.equal(result.sourceUnchanged,true);
  assert.equal(result.safeToProceedWithAutomatedCutover,true);
  assert.equal(result.referencedObjects,1);
  assert.equal(result.missingReferencedObjects,0);
});

test("production orphan object is never classified safe for automated cutover or deletion",()=>{
  const input=base();input.rooms=[{id:12}];
  const result=auditPhotoMigration(input);
  assert.equal(result.unreferencedObjects,1);
  assert.equal(result.safeToProceedWithAutomatedCutover,false);
  assert.ok(result.requiredActions.some(x=>/orphan/i.test(x)));
});

test("missing referenced file blocks cutover without changing source",()=>{
  const input=base();input.objects=[];
  const result=auditPhotoMigration(input);
  assert.equal(result.missingReferencedObjects,1);
  assert.equal(result.safeToProceedWithAutomatedCutover,false);
  assert.equal(result.sourceUnchanged,true);
});

test("public destination, missing backup or unsigned access verification blocks cutover",()=>{
  const publicDest={...base(),destinationPublic:true};
  assert.equal(auditPhotoMigration(publicDest).safeToProceedWithAutomatedCutover,false);
  assert.equal(auditPhotoMigration({...base(),backupVerified:false}).safeToProceedWithAutomatedCutover,false);
  assert.equal(auditPhotoMigration({...base(),destinationAuthorizationVerified:false}).safeToProceedWithAutomatedCutover,false);
});

test("duplicate objects and shared room references block cutover",()=>{
  const duplicated=base();
  duplicated.objects.push({...duplicated.objects[0]});
  assert.equal(auditPhotoMigration(duplicated).safeToProceedWithAutomatedCutover,false);
  const shared=base();
  shared.rooms.push({id:13,floor_photo:"room-12/flooring/fictional.jpg"});
  assert.equal(auditPhotoMigration(shared).safeToProceedWithAutomatedCutover,false);
});

test("legacy public URLs and path traversal are never auto-reinterpreted as private paths",()=>{
  for(const field of ["floor_photo_url","bathroom_photo_url","final_photo_url"]){
    const input=base();input.rooms=[{id:12,[field]:"https://example.invalid/photo"}];
    assert.equal(auditPhotoMigration(input).safeToProceedWithAutomatedCutover,false);
    assert.equal(auditPhotoMigration(input).invalidReferences,1);
  }
  for(const path of ["../secrets.jpg","/room/a.jpg","room/a.jpg?token=leak","https://example.invalid/file","room/../../a.jpg"]){
    const input=base();input.rooms=[{id:12,floor_photo:path}];
    assert.equal(auditPhotoMigration(input).safeToProceedWithAutomatedCutover,false);
  }
});

test("invalid IDs, duplicate room IDs and unapproved input keys block cutover",()=>{
  const input=base();input.rooms=[{id:0,floor_photo:"room-12/flooring/fictional.jpg"}];
  assert.equal(auditPhotoMigration(input).safeToProceedWithAutomatedCutover,false);
  const duplicate=base();duplicate.rooms.push({...duplicate.rooms[0]});
  assert.equal(auditPhotoMigration(duplicate).safeToProceedWithAutomatedCutover,false);
  const sensitive=base();sensitive.rooms[0].guest_name="Do not ingest";
  assert.equal(auditPhotoMigration(sensitive).safeToProceedWithAutomatedCutover,false);
  assert.throws(()=>auditPhotoMigration({...base(),sourceBucket:"same",destinationBucket:"same"}),TypeError);
});
