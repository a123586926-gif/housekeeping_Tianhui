/**
 * Production photo PRIVACY MIGRATION READINESS AUDIT (pure/dry-run).
 * No DB client, network, Storage read/write, file deletion, URL signing,
 * user-facing asset delivery, or automatic migration in this module.
 *
 * Input includes sanitized object paths (not personal or secret data).
 * Do not pass actual photo bytes, guest names, public URLs or credentials.
 */
const PHOTO_FIELDS = Object.freeze([
  "floor_photo","bathroom_photo","final_photo",
  "floor_photo_url","bathroom_photo_url","final_photo_url",
]);

const validId = value => Number.isSafeInteger(value) && value > 0;
const allowed = (input,fields) => input && typeof input === "object" &&
  !Array.isArray(input) && Object.keys(input).every(key => fields.includes(key));

function safePath(path) {
  return typeof path === "string" && path.length>0 && path.length<=500 &&
    !path.startsWith("/") && !path.includes("..") &&
    !path.includes("?") && !path.includes("#") &&
    !/^(https?:|data:|javascript:)/i.test(path) &&
    !/[\\\u0000-\u001f]/.test(path) &&
    path.split("/").every(part=>part.length>0);
}

export function auditPhotoMigration({
  sourceBucket, sourcePublic, destinationBucket, destinationPublic,
  objects, rooms, backupVerified=false, destinationAuthorizationVerified=false,
}){
  if(typeof sourceBucket!=="string"||!sourceBucket.trim()||
     typeof destinationBucket!=="string"||!destinationBucket.trim()||
     sourceBucket===destinationBucket||typeof sourcePublic!=="boolean"||
     typeof destinationPublic!=="boolean"||
     !Array.isArray(objects)||!Array.isArray(rooms)||
     typeof backupVerified!=="boolean"||typeof destinationAuthorizationVerified!=="boolean")
    throw new TypeError("Explicit source, private destination and sanitized inventory required");

  const errors=[],warnings=[];
  if(destinationPublic) errors.push("Destination bucket must be private");
  if(sourcePublic) warnings.push("Legacy source is public: do not expose or change existing access before coordinated cutover");
  if(!backupVerified) warnings.push("Storage bytes and manifest backup not verified");
  if(!destinationAuthorizationVerified)warnings.push("Private destination access restrictions not verified");

  const objectPaths=new Set();
  let invalidObjects=0,duplicateObjects=0;
  for(const obj of objects){
    if(!allowed(obj,["path","sizeBytes","mimeType"])||!safePath(obj.path)||
       !Number.isSafeInteger(obj.sizeBytes)||obj.sizeBytes<0||
       typeof obj.mimeType!=="string"||obj.mimeType.length>100){
      invalidObjects++;continue;
    }
    if(objectPaths.has(obj.path)){duplicateObjects++;continue;}
    objectPaths.add(obj.path);
  }
  if(invalidObjects)errors.push(`${invalidObjects} invalid object metadata entries`);
  if(duplicateObjects)errors.push(`${duplicateObjects} duplicate object paths`);
  const referencedPaths=new Map();
  let invalidRooms=0,invalidReferences=0,missingObjects=0,sharedReferences=0;
  const seenRoomIds=new Set();
  for(const room of rooms){
    if(!allowed(room,["id",...PHOTO_FIELDS])||!validId(room.id)||seenRoomIds.has(room.id)){
      invalidRooms++;continue;
    }
    seenRoomIds.add(room.id);
    for(const field of PHOTO_FIELDS){
      const path=room[field];
      if(path===undefined||path===null||path==="")continue;
      // Old database URL references are NOT paths. Never blindly copy,
      // fetch, or publish a URL from a legacy column.
      if(field.endsWith("_url")||!safePath(path)){
        invalidReferences++;continue;
      }
      if(!objectPaths.has(path))missingObjects++;
      const old=referencedPaths.get(path);
      if(old!==undefined && old!==room.id)sharedReferences++;
      referencedPaths.set(path,room.id);
    }
  }
  if(invalidRooms)errors.push(`${invalidRooms} invalid or duplicate room identities`);
  if(invalidReferences)errors.push(`${invalidReferences} unsupported legacy URLs or unsafe photo paths`);
  if(missingObjects)errors.push(`${missingObjects} database photo references point to absent files`);
  if(sharedReferences)errors.push(`${sharedReferences} photo objects are shared between different rooms`);

  const unreferenced=objects.filter(o=>safePath(o?.path)&&!referencedPaths.has(o.path)).length;
  if(unreferenced)warnings.push(`${unreferenced} unreferenced legacy objects must be retained pending manual classification`);

  return {
    dryRunOnly:true,
    sourceUnchanged:true,
    safeToProceedWithAutomatedCutover:errors.length===0 &&
      unreferenced===0 && backupVerified && destinationAuthorizationVerified &&
      destinationPublic===false,
    sourceObjects:objects.length,
    referencedObjects:referencedPaths.size,
    unreferencedObjects:unreferenced,
    missingReferencedObjects:missingObjects,
    invalidReferences,
    errors,warnings,
    requiredActions:[
      "Do not delete, overwrite, or make the legacy source private while old frontend is active",
      "Back up original object bytes and metadata, verify checksums in an isolated restore",
      "Review every orphan file manually before classifying; preserve it until authorized disposition",
      "Use a distinct private destination bucket and server-authorized short-lived photo access",
      "Copy and checksum files without changing original paths or row IDs until verified",
      "Update database references and remove anonymous policies only in approved coordinated cutover",
      "Keep the source backup and rollback plan; do not treat signing a URL as revocable on logout",
    ],
  };
}
