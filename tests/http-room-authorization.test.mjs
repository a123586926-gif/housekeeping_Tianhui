import test from "node:test";
import assert from "node:assert/strict";
import {createRoomsHandler} from "../api/data/rooms.js";

function response(){
 const headers={};
 return {headers,statusCode:null,body:null,
  setHeader(k,v){headers[k.toLowerCase()]=v;},
  status(n){this.statusCode=n;return this;},
  json(v){this.body=v;return this;},
 };
}
const admin={user:{id:"admin",role:"admin"}};
const cleaner901={user:{id:"cleaner-901",role:"cleaner"}};
const cleaner902={user:{id:"cleaner-902",role:"cleaner"}};
function mockRoomDb({room={id:701,event_id:9101,cleaner_id:901,checklist:[],
 floor_photo:"room-701/flooring/mock.jpg",bathroom_photo:null},writeResult=undefined}={}){
 const calls=[];
 const db={
  from(table){
   calls.push(["from",table]);
   assert.equal(table,"event_rooms");
   const query={
    isUpdate:false,filters:[],
    select(){return this},
    eq(key,val){this.filters.push([key,val]);calls.push(["eq",key,val]);return this},
    update(payload){this.isUpdate=true;calls.push(["update",payload]);return this},
    async maybeSingle(){
     const owner=this.filters.find(([key])=>key==="cleaner_id");
     if(owner&&owner[1]!==room.cleaner_id)return {data:null,error:null};
     if(this.isUpdate){
       if(writeResult!==undefined)return {data:writeResult,error:null};
       return {data:{id:room.id,event_id:room.event_id,status:"pending",progress:0},error:null};
     }
     return {data:room,error:null};
    },
   };
   return query;
  },
  storage:{
   from(bucket){
    assert.equal(bucket,"hk-qa-cleaning-photos");
    return {async createSignedUrl(photoPath,seconds){
      calls.push(["signedUrl",photoPath,seconds]);
      return {data:{signedUrl:"https://example.invalid/signed-mock"},error:null};
    }};
   },
  },
 };
 return {db,calls};
}
test("room endpoint denies GET and PATCH when no session (401) without DB access",async()=>{
 let accesses=0;
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>null,
   dbFactory:()=>{accesses++;throw Error("no DB")}});
 for(const req of [
  {method:"GET",query:{roomId:"701",itemId:"flooring"}},
  {method:"PATCH",body:{roomId:701,changes:{assignedTo:"未分配"}}},
 ]){
   const res=response();
   await handler(req,res);
   assert.equal(res.statusCode,401);
 }
 assert.equal(accesses,0);
});
test("room writes reject cross-site requests before DB/session access",async()=>{
 let accesses=0;
 const handler=createRoomsHandler({originAllowed:()=>false,
  sessionReader:async()=>{accesses++;return admin;},
  dbFactory:()=>{accesses++;throw Error("no DB")}});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{assignedTo:"未分配"}}},res);
 assert.equal(res.statusCode,403);
 assert.equal(accesses,0);
});
test("cleaner cannot create or delete rooms (403)",async()=>{
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,
  dbFactory:()=>mockRoomDb().db});
 for(const method of ["PUT","DELETE"]){
  const res=response();
  await handler({method,body:{roomId:701}},res);
  assert.equal(res.statusCode,403);
 }
});
test("cleaner cannot modify occupant or assignment (403) without DB mutation",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,
  dbFactory:()=>mock.db});
 for(const changes of [{occupant:"私密客戶"},{assignedTo:"另一位人員"}]){
   const res=response();
   await handler({method:"PATCH",body:{roomId:701,changes}},res);
   assert.equal(res.statusCode,403);
 }
 assert.equal(mock.calls.some(c=>c[0]==="update"),false);
});
test("cleaner without room assignment cannot modify checklist (403)",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner902,
  dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{checklist:[]}}},res);
 assert.equal(res.statusCode,403);
 assert.equal(mock.calls.some(c=>c[0]==="update"),false);
});
test("cleaner viewing someone else's photo receives 403 without signed URL",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner902,
  dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"GET",query:{roomId:"701",itemId:"flooring"}},res);
 assert.equal(res.statusCode,403);
 assert.equal(mock.calls.some(c=>c[0]==="signedUrl"),false);
});
test("assigned cleaner can view only selected room photo with 60-second signed URL",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,
  dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"GET",query:{roomId:"701",itemId:"flooring"}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.expiresIn,60);
 assert.equal(mock.calls.some(c=>c[0]==="eq"&&c[1]==="cleaner_id"&&c[2]===901),true);
 assert.deepEqual(mock.calls.find(c=>c[0]==="signedUrl"),["signedUrl","room-701/flooring/mock.jpg",60]);
});
test("room optimistic concurrency failure responds 409 and no false success",async()=>{
 const mock=mockRoomDb({writeResult:null});
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,
  dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{checklist:[]}}},res);
 assert.equal(res.statusCode,409);
 assert.equal(res.body.room,undefined);
 assert.equal(mock.calls.some(c=>c[0]==="eq"&&c[1]==="cleaner_id"&&c[2]===901),true);
});

test("room IDs reject coercible, noncanonical and unsafe values without querying rooms",async()=>{
  const mock=mockRoomDb();
  const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,
    dbFactory:()=>mock.db});
  const invalid=[true,false,[701],{"id":701},"0701","7e2","701.0"," 701 ","+701",0,-1,1.5,Number.MAX_SAFE_INTEGER+1,{},null];
  for(const roomId of invalid){
    const res=response();
    await handler({method:"PATCH",body:{roomId,changes:{occupant:"測試"}}},res);
    assert.equal(res.statusCode,400,`roomId=${JSON.stringify(roomId)}`);
  }
  assert.equal(mock.calls.length,0);
  const valid=response();
  await handler({method:"PATCH",body:{roomId:"701",changes:{occupant:"測試"}}},valid);
  assert.equal(valid.statusCode,200);
  assert.equal(mock.calls.some(c=>c[0]==="update"),true);
});

test("photo uploads are paused for all roles and payloads before reading session or Storage",async()=>{
 let calls=0;
 const handler=createRoomsHandler({
   originAllowed:()=>{calls++;return true},
   sessionReader:async()=>{calls++;return admin},
   dbFactory:()=>{calls++;throw Error("should not connect")},
 });
 for (const body of [
   {roomId:701,itemId:"flooring",mime:"image/png",base64:"iVBORw0KGgo="},
   {roomId:701,itemId:"bathroom",mime:"image/jpeg",base64:"/9j/"},
   {roomId:701,itemId:"__proto__",mime:"image/png",base64:"bad"},
   {},
 ]) {
   const res=response();
   await handler({method:"POST",body},res);
   assert.equal(res.statusCode,503);
   assert.match(res.body.error,/temporarily paused/);
 }
 assert.equal(calls,0);
});

test("previously saved photos remain readable while uploads are paused",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,
  dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"GET",query:{roomId:"701",itemId:"flooring"}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.expiresIn,60);
});

const cleaningChecklist=[
 {id:"flooring",requiredPhoto:true,done:false,photo:false,subItems:[{id:"sweep",done:false},{id:"mop",done:false}]},
 {id:"bathroom",requiredPhoto:true,done:false,photo:false,subItems:[{id:"wash",done:false}]},
];
const flags=(items)=>items.map(item=>({
 id:item.id,done:item.done,photo:item.photo,
 subItems:item.subItems.map(sub=>({id:sub.id,done:sub.done})),
}));
test("paused photo upload does not prevent legitimate checklist 100% completion",async()=>{
 const mock=mockRoomDb({room:{id:701,event_id:9101,cleaner_id:901,checklist:cleaningChecklist,
  floor_photo:null,bathroom_photo:null}});
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,dbFactory:()=>mock.db});
 const next=flags(cleaningChecklist).map(item=>({
  ...item,done:true,photo:true,subItems:item.subItems.map(sub=>({...sub,done:true})),
 }));
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{checklist:next},
  expectedChecklist:flags(cleaningChecklist)}},res);
 assert.equal(res.statusCode,200);
 const write=mock.calls.find(c=>c[0]==="update")?.[1];
 assert.equal(write?.status,"completed");
 assert.equal(write?.progress,100);
 assert.equal(write?.cleaning_progress,100);
 assert.equal(write?.cleaning_status,"已完成");
 assert.equal(write?.checklist.every(item=>item.done),true);
 assert.equal(write?.checklist.every(item=>item.photo===false),true,
  "client must never be able to fake persisted photo evidence");
});
test("pausing photos preserves existing photo evidence when checklist is unchecked",async()=>{
 const roomChecklist=cleaningChecklist.map((item,i)=>({
  ...item,done:true,photo:i===0,subItems:item.subItems.map(sub=>({...sub,done:true})),
 }));
 const mock=mockRoomDb({room:{id:701,event_id:9101,cleaner_id:901,checklist:roomChecklist,
 floor_photo:"room-701/flooring/mock.jpg",bathroom_photo:null}});
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,dbFactory:()=>mock.db});
 const next=flags(roomChecklist).map(item=>({...item,done:false,photo:false,
 subItems:item.subItems.map(sub=>({...sub,done:false}))}));
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{checklist:next}}},res);
 assert.equal(res.statusCode,200);
 const write=mock.calls.find(c=>c[0]==="update")?.[1];
 assert.equal(write?.status,"pending");
 assert.equal(write?.progress,0);
 assert.equal(write?.checklist[0].photo,true);
});
test("server rejects parent completion if any child task remains unchecked",async()=>{
 const mock=mockRoomDb({room:{id:701,event_id:9101,cleaner_id:901,checklist:cleaningChecklist}});
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,dbFactory:()=>mock.db});
 const inconsistent=flags(cleaningChecklist);
 inconsistent[0].done=true;
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{checklist:inconsistent}}},res);
 assert.equal(res.statusCode,400);
 assert.equal(mock.calls.some(c=>c[0]==="update"),false);
});

test("admin assigns room using immutable cleaner ID and server-owned display name",async()=>{
 const calls=[];
 const db={
  from(table){
   if(table==="event_rooms"){
    return {
     isUpdate:false,
     select(){return this;},
     eq(){return this;},
     update(payload){this.isUpdate=true;calls.push(["write",payload]);return this;},
     async maybeSingle(){return {data:this.isUpdate?{id:701,event_id:9101,status:"pending",progress:0}:
       {id:701,cleaner_id:null,event_id:9101,checklist:[]},error:null};},
    };
   }
   assert.equal(table,"cleaners");
   return {
    select(){return this;},
    eq(name,value){calls.push(["cleanerEq",name,value]);return this;},
    async maybeSingle(){return {data:{id:902,name:"同名房務"},error:null};},
   };
  },
 };
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{assignedCleanerId:902}}},res);
 assert.equal(res.statusCode,200);
 assert.equal(calls.some(x=>x[0]==="cleanerEq"&&x[1]==="id"&&x[2]===902),true);
 const saved=calls.find(x=>x[0]==="write")[1];
 assert.equal(saved.cleaner_id,902);
 assert.equal(saved.assigned_to,"同名房務");
});
test("admin unassigns room without finding a cleaner by name",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{assignedCleanerId:null}}},res);
 assert.equal(res.statusCode,200);
 const patch=mock.calls.find(x=>x[0]==="update")[1];
 assert.equal(patch.cleaner_id,null);
 assert.equal(patch.assigned_to,"未分配");
});
test("invalid immutable assignment ID and mixed legacy name are rejected before write",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>mock.db});
 for(const changes of [
  {assignedCleanerId:"902"}, {assignedCleanerId:0},
  {assignedCleanerId:-1}, {assignedCleanerId:1.5},
  {assignedCleanerId:902,assignedTo:"其他人"},
 ]){
  const res=response();
  await handler({method:"PATCH",body:{roomId:701,changes}},res);
  assert.equal(res.statusCode,400);
 }
 assert.equal(mock.calls.some(x=>x[0]==="update"),false);
});
test("cleaner cannot reassign room using stable cleaner ID",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{assignedCleanerId:902}}},res);
 assert.equal(res.statusCode,403);
 assert.equal(mock.calls.some(x=>x[0]==="update"),false);
});

test("legacy name-based room assignment rejects ambiguous duplicate names",async()=>{
 const db={
  from(table){
   if(table==="event_rooms"){
    return {select(){return this;},eq(){return this;},
      async maybeSingle(){return {data:{id:701,cleaner_id:null,event_id:9101,checklist:[]},error:null};},
      update(){throw Error("must not update");}};
   }
   assert.equal(table,"cleaners");
   return {select(){return this;},eq(){return this;},limit(){return this;},
     then(resolve){return Promise.resolve({data:[
       {id:901,name:"同名測試"}, {id:902,name:"同名測試"}],error:null}).then(resolve);}};
  },
 };
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>db});
 const res=response();
 await handler({method:"PATCH",body:{roomId:701,changes:{assignedTo:"同名測試"}}},res);
 assert.equal(res.statusCode,409);
});

test("spoofed administrator, malformed cleaner ID are rejected before database access",async()=>{
 for(const user of [{role:"admin",id:"cleaner-901"},{role:"cleaner",id:"cleaner-abc"},{role:"cleaner",id:"cleaner-0"}]){
  let accesses=0;
  const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>({user}),dbFactory:()=>{accesses++;throw Error("Forbidden DB use");}});
  const res=response();
  await handler({method:"PATCH",body:{roomId:701,changes:{occupant:"測試"}}},res);
  assert.equal(res.statusCode,403);
  assert.equal(accesses,0);
 }
});
