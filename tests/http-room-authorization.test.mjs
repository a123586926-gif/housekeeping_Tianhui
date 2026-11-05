import test from "node:test";
import assert from "node:assert/strict";
import {createRoomsHandler,summarizeChecklist} from "../api/data/rooms.js";
import {createGuestMoveHandler} from "../api/data/guest-move.js";

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
    assert.equal(bucket,process.env.VERCEL_ENV==="production" ? "cleaning-photos" : "hk-qa-cleaning-photos");
    return {async createSignedUrl(photoPath,seconds){
      calls.push(["signedUrl",photoPath,seconds]);
      return {data:{signedUrl:"https://example.invalid/signed-mock"},error:null};
    }};
   },
  },
 };
 return {db,calls};
}
test("admin room creation requires a positive RPC room ID and preserves exact input",async()=>{
 for(const [returnedId,expectedStatus] of [[null,503],[0,503],[-1,503],["invalid",503],[812,201]]){
  const calls=[];
  const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,
   dbFactory:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:returnedId,error:null};}})});
  const res=response();
  await handler({method:"PUT",body:{eventId:9101,building:"A",floor:"2F",roomNo:"A201"}},res);
  assert.equal(res.statusCode,expectedStatus);
  assert.equal(calls.length,1);
  if(expectedStatus===201){
   assert.equal(res.body.roomId,812);
   assert.equal(calls[0].args.p_room_no,"A201");
  } else {
   assert.equal(res.body.ok,undefined,"must not claim created on invalid DB response");
  }
 }
});
test("admin room deletion distinguishes database refusal from successful deletion",async()=>{
 for(const [deleted,expected] of [[false,403],[true,200]]){
  const calls=[];
  const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,
   dbFactory:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:deleted,error:null};}})});
  const res=response();
  await handler({method:"DELETE",body:{roomId:701}},res);
  assert.equal(res.statusCode,expected);
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.p_room_id,701);
  assert.equal(res.body.ok,deleted?true:undefined);
 }
});
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

test("stale admin reassignment is rejected without changing the previous cleaner or checklist",async()=>{
 const originalChecklist=[{id:"flooring",done:true,photo:false,subItems:[{id:"sweep",done:true}]}];
 const mock=mockRoomDb({room:{id:701,event_id:9101,cleaner_id:902,checklist:originalChecklist}});
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>mock.db});
 const res=response();
 await handler({method:"PATCH",body:{
   roomId:701,changes:{assignedCleanerId:901},expectedAssignedCleanerId:901,
 }},res);
 assert.equal(res.statusCode,409);
 assert.equal(mock.calls.some(call=>call[0]==="update"),false);
 assert.deepEqual(originalChecklist,[{id:"flooring",done:true,photo:false,subItems:[{id:"sweep",done:true}]}]);
});
test("admin assignment uses atomic compare-and-swap for the previous cleaner",async()=>{
 const calls=[];
 const db={from(table){
   if(table==="event_rooms")return {
     updating:false,select(){return this;},
     eq(field,value){calls.push(["eq",field,value]);return this;},
     update(payload){this.updating=true;calls.push(["update",payload]);return this;},
     async maybeSingle(){return {data:this.updating?{id:701,event_id:9101,status:"in_progress",progress:50}:
       {id:701,event_id:9101,cleaner_id:901,checklist:[{id:"flooring",done:true}]},error:null};},
   };
   if(table==="cleaners")return {
     select(){return this;},eq(){return this;},
     async maybeSingle(){return {data:{id:902,name:"房務二"},error:null};},
   };
   throw new Error("unexpected table");
 }};
 const res=response();
 await createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,dbFactory:()=>db})
   ({method:"PATCH",body:{roomId:701,changes:{assignedCleanerId:902},expectedAssignedCleanerId:901}},res);
 assert.equal(res.statusCode,200);
 assert.ok(calls.some(call=>call[0]==="eq"&&call[1]==="cleaner_id"&&call[2]===901));
 const write=calls.find(call=>call[0]==="update")?.[1];
 assert.equal(write.cleaner_id,902);
 assert.equal(write.assigned_to,"房務二");
 assert.equal(Object.hasOwn(write,"checklist"),false);
 assert.equal(Object.hasOwn(write,"progress"),false);
});
test("malformed reassignment snapshots are rejected before touching database",async()=>{
 let touched=0;
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,
 dbFactory:()=>({from(){touched++;throw Error("no database query expected");}})});
 for(const bad of ["901",0,-1,{},[],1.5]){
   const res=response();
   await handler({method:"PATCH",body:{roomId:701,changes:{assignedCleanerId:902},
     expectedAssignedCleanerId:bad}},res);
   assert.equal(res.statusCode,400);
 }
 assert.equal(touched,0);
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
test("progress and both legacy/new status fields agree for 0%, 50% and 100% completion",async()=>{
 const cases=[
   {done:[false,false],status:"pending",pct:0,zh:"未開始"},
   {done:[true,false],status:"in_progress",pct:50,zh:"進行中"},
   {done:[true,true],status:"completed",pct:100,zh:"已完成"},
 ];
 for(const state of cases){
   const roomChecklist=cleaningChecklist.map(item=>({
     ...item,done:false,subItems:item.subItems.map(sub=>({...sub,done:false})),
   }));
   const next=roomChecklist.map((item,i)=>({
     ...item,done:state.done[i],
     subItems:item.subItems.map(sub=>({...sub,done:state.done[i]})),
   }));
   const summary=summarizeChecklist(next);
   assert.deepEqual(summary,{status:state.status,progress:state.pct,cleaningStatus:state.zh});
   const mock=mockRoomDb({room:{id:701,event_id:9101,cleaner_id:901,checklist:roomChecklist}});
   const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>cleaner901,dbFactory:()=>mock.db});
   const res=response();
   await handler({method:"PATCH",body:{roomId:701,changes:{checklist:flags(next)},expectedChecklist:flags(roomChecklist)}},res);
   assert.equal(res.statusCode,200);
   const write=mock.calls.find(call=>call[0]==="update")?.[1];
   assert.equal(write?.status,state.status);
   assert.equal(write?.cleaning_status,state.zh);
   assert.equal(write?.progress,state.pct);
   assert.equal(write?.cleaning_progress,state.pct);
   assert.deepEqual(write?.checklist.map(item=>item.done),state.done);
 }
 assert.deepEqual(summarizeChecklist([]),{status:"pending",progress:0,cleaningStatus:"未開始"});
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

test("atomic guest move denies unauthenticated/cleaner/cross-origin requests before database calls",async()=>{
 let called=0;
 for(const c of [
  {originAllowed:()=>false,sessionReader:async()=>admin,status:403},
  {originAllowed:()=>true,sessionReader:async()=>null,status:401},
  {originAllowed:()=>true,sessionReader:async()=>cleaner901,status:403},
 ]) {
  const handler=createGuestMoveHandler({
   originAllowed:c.originAllowed,sessionReader:c.sessionReader,
   dbFactory:()=>{called++;throw Error("database must not be accessed");},
  });
  const res=response();
  await handler({method:"POST",body:{fromRoomId:1,toRoomId:2,name:"李貞儀",expectedFrom:"李貞儀",expectedTo:""}},res);
  assert.equal(res.statusCode,c.status);
 }
 assert.equal(called,0);
});

test("atomic guest move validates exact input, invokes one SQL transaction and refuses conflicts",async()=>{
 let calls=0;
 const handler=createGuestMoveHandler({
  originAllowed:()=>true,sessionReader:async()=>admin,
  dbFactory:()=>({rpc:async(name,args)=>{
   calls++;
   assert.equal(name,"hk_move_guest_atomic");
   assert.deepEqual(args,{p_from_room_id:11,p_to_room_id:22,p_name:"李貞儀",
    p_expected_from:"李貞儀、陳美華",p_expected_to:""});
   return {data:true,error:null};
  }}),
 });
 const body={fromRoomId:11,toRoomId:22,name:"李貞儀",expectedFrom:"李貞儀、陳美華",expectedTo:""};
 const res=response();
 await handler({method:"POST",body},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.ok,true);
 assert.equal(calls,1);
 for(const invalid of [{...body,name:"李貞儀、陳美華"},{...body,toRoomId:11},{...body,expectedFrom:null}]){
  const reply=response();
  await handler({method:"POST",body:invalid},reply);
  assert.equal(reply.statusCode,400);
 }
 assert.equal(calls,1);
 const conflict=createGuestMoveHandler({originAllowed:()=>true,sessionReader:async()=>admin,
   dbFactory:()=>({rpc:async()=>({data:null,error:{message:"ROOM_CHANGED"}})})});
 const reply=response();
 await conflict({method:"POST",body},reply);
 assert.equal(reply.statusCode,409);
 assert.notEqual(reply.body.ok,true);
});
