import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {assertProductionSource,validateStorageKey,safeTarget,
  createEntry,verifyManifest} from "../scripts/backup/storage-backup-core.mjs";

test("only exact production Supabase HTTPS source is accepted",()=>{
 assert.equal(assertProductionSource("https://xmdznhkkvtohwxkahisr.supabase.co"),true);
 for(const url of ["https://zhvrgluwoookxaglfjdw.supabase.co",
  "https://xmdznhkkvtohwxkahisr.supabase.co.attacker.test",
  "http://xmdznhkkvtohwxkahisr.supabase.co",
  "https://xmdznhkkvtohwxkahisr.supabase.co/prefix",
  "https://xmdznhkkvtohwxkahisr.supabase.co?key=1","not a url"])
 assert.throws(()=>assertProductionSource(url));
});
test("Storage key must stay inside encrypted backup root",()=>{
 const root=path.resolve("/tmp/test-encrypted-backup/storage");
 assert.equal(safeTarget(root,"folder/photo.jpg"),path.join(root,"folder/photo.jpg"));
 for(const unsafe of ["../secrets", "folder/../../escape","/absolute","folder//photo.jpg",
  "folder/./photo.jpg","folder\\photo.jpg","folder/file.jpg?token=x","",
  ".env","folder/.hidden","https://evil.test/img"]){
   assert.throws(()=>validateStorageKey(unsafe));
 }
});
test("manifest reflects actual downloaded bytes and SHA-256",()=>{
 const file=Buffer.from("fictional backup bytes");
 const entry=createEntry("fictional/test.jpg",file,"image/jpeg");
 assert.equal(entry.bytes,file.length);
 assert.match(entry.sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(verifyManifest([entry]),{objectCount:1,totalBytes:file.length});
});
test("duplicate or incomplete object metadata fails closed",()=>{
 const e=createEntry("room/example.png",Buffer.from("mock"),"image/png");
 assert.throws(()=>verifyManifest([e,e]),/Duplicate/);
 assert.throws(()=>verifyManifest([{...e,sha256:"incorrect"}]));
 assert.throws(()=>verifyManifest([{...e,bytes:-1}]));
});
test("binary is never serialized inside manifest",()=>{
 const e=createEntry("folder/mock.webp",Buffer.from([0,1,2,3]),"image/webp");
 assert.equal(Object.hasOwn(e,"data"),false);
 assert.equal(Object.hasOwn(e,"buffer"),false);
 assert.equal(Object.hasOwn(e,"bytes"),true);
});
