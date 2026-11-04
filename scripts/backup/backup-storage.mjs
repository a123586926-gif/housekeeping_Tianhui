/**
 * Run LOCALLY on a trusted Windows machine after reviewing the runbook.
 * READ ONLY to Supabase Storage; never uploads, removes or changes policies.
 * Do not run in CI/Vercel or commit any output files.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage: node scripts/backup/backup-storage.mjs --out "D:\\EncryptedBackups\\HK-2026..."
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {createClient} from "@supabase/supabase-js";
import {
  EXPECTED_PROJECT,SOURCE_BUCKET,assertProductionSource,
  safeTarget,validateStorageKey,createEntry,verifyManifest,
} from "./storage-backup-core.mjs";

async function listObjects(storage,prefix=""){
  const found=[];
  let offset=0;
  while(true){
    const {data,error}=await storage.list(prefix,{limit:1000,offset,sortBy:{column:"name",order:"asc"}});
    if(error)throw new Error("Storage list failed: "+error.message);
    if(!Array.isArray(data))throw new Error("Storage list returned invalid metadata");
    for(const row of data){
      if(!row||typeof row.name!=="string")throw new Error("Invalid Storage object");
      const key=prefix?`${prefix}/${row.name}`:row.name;
      validateStorageKey(key);
      if(row.id==null){
        found.push(...await listObjects(storage,key));
      }else{
        found.push({key,mime:row.metadata?.mimetype||null,expectedSize:row.metadata?.size});
      }
    }
    if(data.length<1000)break;
    offset+=data.length;
    if(offset>200000)throw new Error("Storage list safety limit exceeded");
  }
  return found;
}

async function main(){
  if(process.env.CI || process.env.VERCEL || process.env.VERCEL_ENV)
    throw new Error("Backup export may only run on a local trusted machine");
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=="--out")throw new Error('Usage: node scripts/backup/backup-storage.mjs --out "D:\\EncryptedBackups\\NewFolder"');
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  assertProductionSource(url);
  if(typeof key!=="string"||key.length<25)throw new Error("Missing local service-role secret");
  const out=path.resolve(args[1]);
  const workingTree=path.resolve(process.cwd());
  if(out===workingTree||out.startsWith(workingTree+path.sep))
    throw new Error("Backup output must be outside Git repository");
  const parent=path.dirname(out);
  const parentInfo=await fs.stat(parent);
  if(!parentInfo.isDirectory())throw new Error("Backup parent folder missing");
  // Exclusive create prevents overwriting previous backups. Treat partial output
  // as INCOMPLETE and delete only after manual inspection, never automatically.
  await fs.mkdir(out);
  const storageDir=path.join(out,"storage");
  await fs.mkdir(storageDir);
  const api=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const bucket=api.storage.from(SOURCE_BUCKET);
  const objects=await listObjects(bucket);
  const keys=new Set(),entries=[];
  for(const item of objects){
    if(keys.has(item.key))throw new Error("Duplicate Storage object key");
    keys.add(item.key);
    const dest=safeTarget(storageDir,item.key);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    const {data,error}=await bucket.download(item.key);
    if(error||!data)throw new Error("Storage download failed for object "+entries.length);
    const buffer=Buffer.from(await data.arrayBuffer());
    if(Number.isSafeInteger(item.expectedSize)&&item.expectedSize!==buffer.length)
      throw new Error("Storage metadata size mismatch for object "+entries.length);
    await fs.writeFile(dest,buffer,{flag:"wx"});
    entries.push(createEntry(item.key,buffer,item.mime));
  }
  const totals=verifyManifest(entries);
  const manifest={
    sourceProject:EXPECTED_PROJECT,bucket:SOURCE_BUCKET,
    takenAtUtc:new Date().toISOString(),...totals,
    objects:entries,
    // A manifest alone cannot prove a restore or DB backup was completed.
    restoreVerified:false,productionUntouched:true,
  };
  await fs.writeFile(path.join(out,"storage-manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx"});
  console.log(`Storage export completed: ${totals.objectCount} objects, ${totals.totalBytes} bytes. Keep files encrypted; restore not verified.`);
}
main().catch(e=>{
  // Never dump environment variables or secret-containing stack traces.
  console.error("Storage backup did not complete:",e instanceof Error?e.message:"unknown error");
  process.exitCode=1;
});
