import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {inventoryObjects,backupStorageObjects} from "../scripts/backup/storage-backup-runner.mjs";
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

function fakeStorage(entries){
  const calls=[];
  return {
    calls,
    async list(prefix,{offset,limit}){
      calls.push(["list",prefix]);
      if(prefix)return {data:[],error:null};
      return {data:entries.slice(offset,offset+limit).map(x=>({
        id:x.id??"file-id",name:x.name,metadata:{size:x.bytes.length,mimetype:"image/png"},
      })),error:null};
    },
    async download(key){
      calls.push(["download",key]);
      const file=entries.find(x=>x.name===key);
      if(!file)return {data:null,error:new Error("not found")};
      return {data:new Blob([file.bytes]),error:null};
    },
  };
}
test("local mock Storage backup writes real bytes and validates SHA-256 without contacting production",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"hk-backup-mock-"));
 try{
   const fake=fakeStorage([{name:"fictional-image.png",bytes:Buffer.from("offline mock content")}]);
   const result=await backupStorageObjects(fake,dir);
   assert.equal(result.objectCount,1);
   assert.equal(result.totalBytes,20);
   const onDisk=await fs.readFile(path.join(dir,"fictional-image.png"));
   assert.equal(onDisk.toString(),"offline mock content");
   assert.equal(result.entries[0].sha256,createEntry("fictional-image.png",onDisk,"image/png").sha256);
   assert.equal(fake.calls.some(c=>c[0]==="download"),true);
   assert.equal(fake.calls.some(c=>["upload","remove","update"].includes(c[0])),false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test("empty inventory fails closed, not a successful complete backup",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"hk-backup-empty-"));
 try{
   await assert.rejects(()=>backupStorageObjects(fakeStorage([]),dir),/inventory count/);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test("a mismatched Storage size fails without reporting a completed export",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"hk-backup-mismatch-"));
 try{
   const fake=fakeStorage([{name:"object.png",bytes:Buffer.from("example")}]);
   const oldList=fake.list.bind(fake);
   fake.list=async(...args)=>{
     const r=await oldList(...args);
     if(r.data.length)r.data[0].metadata.size+=5;
     return r;
   };
   await assert.rejects(()=>backupStorageObjects(fake,dir),/size mismatch/);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test("invalid folder paths are rejected before any download",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"hk-backup-invalid-"));
 try{
   const fake=fakeStorage([{name:"../escape.png",bytes:Buffer.from("a")}]);
   await assert.rejects(()=>backupStorageObjects(fake,dir),/Unsafe Storage key/);
   assert.equal(fake.calls.some(x=>x[0]==="download"),false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test("Windows reserved filenames and trailing dots are rejected",()=>{
 for(const name of ["CON","NUL.png","folder/COM1.jpg","folder/LPT9","photo.jpg.","photo.jpg ","room/pic:ads","room/photo<test>.jpg"])
   assert.throws(()=>validateStorageKey(name));
});
