import {createHash} from "node:crypto";
import path from "node:path";

export const EXPECTED_PROJECT = "xmdznhkkvtohwxkahisr";
export const SOURCE_BUCKET = "cleaning-photos";

export function assertProductionSource(url){
  let parsed;
  try{parsed=new URL(url)}catch{throw new Error("Invalid SUPABASE_URL")}
  if(parsed.protocol!=="https:"||
     parsed.hostname!==`${EXPECTED_PROJECT}.supabase.co`||
     parsed.pathname!=="/"||parsed.search||parsed.hash||
     parsed.username||parsed.password)throw new Error("Source must be exact production Supabase HTTPS API origin");
  return true;
}
export function validateStorageKey(value){
  if(typeof value!=="string"||value.length<1||value.length>600||
     /[\\\u0000-\u001f\u007f]/.test(value)||
     value.startsWith("/")||value.includes("?")||value.includes("#")||
     value.split("/").some(x=>!x||x==="."||x===".."||x.startsWith(".")) ||
     /^(https?:|data:)/i.test(value))
    throw new Error("Unsafe Storage key");
  return value;
}
export function safeTarget(root,key){
  validateStorageKey(key);
  const base=path.resolve(root);
  const dest=path.resolve(base,...key.split("/"));
  if(!dest.startsWith(base+path.sep))throw new Error("Storage key escapes backup directory");
  return dest;
}
export function sha256(bytes){return createHash("sha256").update(bytes).digest("hex")}
export function createEntry(key,bytes,mime){
  validateStorageKey(key);
  if(!Buffer.isBuffer(bytes))throw new TypeError("Expected downloaded file bytes");
  return {key,bytes:bytes.byteLength,sha256:sha256(bytes),mimeType:typeof mime==="string"?mime:null};
}
export function verifyManifest(entries){
  if(!Array.isArray(entries))throw new TypeError("Manifest must be array");
  const keys=new Set();
  for(const e of entries){
    validateStorageKey(e.key);
    if(keys.has(e.key))throw new Error("Duplicate object key");
    keys.add(e.key);
    if(!Number.isSafeInteger(e.bytes)||e.bytes<0||!(/^[a-f0-9]{64}$/).test(e.sha256))
      throw new Error("Invalid object manifest");
  }
  return {objectCount:entries.length,totalBytes:entries.reduce((sum,e)=>sum+e.bytes,0)};
}
