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
import { backupStorageObjects } from "./storage-backup-runner.mjs";

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
  const {entries,objectCount,totalBytes}=await backupStorageObjects(bucket,storageDir,{minExpectedObjects:1});
  const manifest={
    sourceProject:EXPECTED_PROJECT,bucket:SOURCE_BUCKET,
    takenAtUtc:new Date().toISOString(),objectCount,totalBytes,
    objects:entries,
    // A manifest alone cannot prove a restore or DB backup was completed.
    restoreVerified:false,productionUntouched:true,
  };
  await fs.writeFile(path.join(out,"storage-manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx"});
  console.log(`Storage export completed: ${objectCount} objects, ${totalBytes} bytes. Keep files encrypted; restore not verified.`);
}
main().catch(e=>{
  // Never dump environment variables or secret-containing stack traces.
  console.error("Storage backup did not complete:",e instanceof Error?e.message:"unknown error");
  process.exitCode=1;
});
