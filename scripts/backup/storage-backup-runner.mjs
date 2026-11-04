/**
 * Storage backup runner. Dependency injection permits genuine filesystem tests
 * against a fake Storage API without ever connecting to Supabase.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createEntry,safeTarget,validateStorageKey,verifyManifest} from "./storage-backup-core.mjs";

export async function inventoryObjects(storage,prefix="",depth=0){
  if(depth>20)throw new Error("Storage folder nesting limit exceeded");
  const found=[];
  let offset=0;
  while(true){
    const {data,error}=await storage.list(prefix,{limit:1000,offset,sortBy:{column:"name",order:"asc"}});
    if(error)throw new Error("Storage list failed");
    if(!Array.isArray(data))throw new Error("Storage list returned invalid metadata");
    for(const row of data){
      if(!row||typeof row.name!=="string")throw new Error("Invalid Storage object");
      const key=prefix?`${prefix}/${row.name}`:row.name;
      validateStorageKey(key);
      if(row.id==null){
        found.push(...await inventoryObjects(storage,key,depth+1));
      }else{
        const size=row.metadata?.size;
        const expectedSize=size===undefined||size===null?null:Number(size);
        if(expectedSize!==null && (!Number.isSafeInteger(expectedSize)||expectedSize<0))
          throw new Error("Invalid object size metadata");
        found.push({key,mime:row.metadata?.mimetype||null,expectedSize});
      }
    }
    if(data.length<1000)break;
    offset+=data.length;
    if(offset>200000)throw new Error("Storage listing safety limit exceeded");
  }
  return found;
}

export async function backupStorageObjects(storage,outputFolder,{
  minExpectedObjects=1,maxExpectedObjects=200000,
}={}){
  const objects=await inventoryObjects(storage);
  if(objects.length<minExpectedObjects||objects.length>maxExpectedObjects)
    throw new Error("Storage inventory count outside approved bounds");
  const keys=new Set(),entries=[];
  for(const item of objects){
    if(keys.has(item.key))throw new Error("Duplicate object key");
    keys.add(item.key);
    const dest=safeTarget(outputFolder,item.key);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    const {data,error}=await storage.download(item.key);
    if(error||!data)throw new Error("Storage download failed");
    const buffer=Buffer.from(await data.arrayBuffer());
    if(item.expectedSize!==null && item.expectedSize!==buffer.byteLength)
      throw new Error("Storage metadata size mismatch");
    await fs.writeFile(dest,buffer,{flag:"wx"});
    // Verify that the file on disk is actually identical to the downloaded bytes.
    const diskBytes=await fs.readFile(dest);
    if(!diskBytes.equals(buffer))throw new Error("Stored file checksum mismatch");
    entries.push(createEntry(item.key,diskBytes,item.mime));
  }
  const totals=verifyManifest(entries);
  return {entries,...totals};
}
