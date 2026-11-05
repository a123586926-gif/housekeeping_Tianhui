import test from "node:test";
import assert from "node:assert/strict";
import {createEventHandler} from "../api/data/event-create.js";
import {createLegacyEventUpdateHandler} from "../api/data/event-update.js";
import {createLegacyEventDeleteHandler} from "../api/data/event-delete.js";

const admin={user:{id:"admin",role:"admin"}};
const cleaner={user:{id:"cleaner-901",role:"cleaner"}};
function response(){
 return {statusCode:null,body:null,headers:{},
  setHeader(k,v){this.headers[k]=v;},
  status(v){this.statusCode=v;return this;},
  json(v){this.body=v;return this;}};
}
const event=(type="活動")=>({
 event_date:"2026-11-05",event_name:"【權限驗收】住宿活動",
 event_type:type,notes:""});
function makeDb(savedType="活動"){
 const calls=[];
 return {calls,db:{
  rpc:async(name,args)=>{calls.push({name,args});return {data:510,error:null}},
  from:(table)=>{
   assert.equal(table,"events");
   return {
    select(){return this;},
    eq(){return this;},
    async maybeSingle(){return {data:{id:9101,event_name:"【權限驗收】原活動",event_type:savedType},error:null}},
    update(payload){calls.push({update:payload});return this;},
   };
  },
 }};
}
test("overnight stay creates the same 84-room cleaning roster as other cleaning events",async()=>{
 const mock=makeDb();
 const handler=createEventHandler({dbFactory:()=>mock.db,sessionReader:async()=>admin,originAllowed:()=>true});
 const res=response();
 await handler({method:"POST",body:{event:event("住宿")}},res);
 assert.equal(res.statusCode,201);
 assert.equal(res.body.roomsCreated,84);
 assert.equal(mock.calls[0].name,"hk_create_event_with_rooms");
 assert.equal(mock.calls[0].args.p_rooms.length,84);
});
test("non-cleaning event creates no room roster",async()=>{
 const mock=makeDb();
 const handler=createEventHandler({dbFactory:()=>mock.db,sessionReader:async()=>admin,originAllowed:()=>true});
 const res=response();
 await handler({method:"POST",body:{event:event("一般活動")}},res);
 assert.equal(res.statusCode,201);
 assert.equal(res.body.roomsCreated,0);
});
test("changing cleaning classification rejects mutation to avoid hidden or missing rooms",async()=>{
 for(const [before,after] of [["活動","一般活動"],["一般活動","住宿"]]){
  const mock=makeDb(before);
  const handler=createEventHandler({dbFactory:()=>mock.db,sessionReader:async()=>admin,originAllowed:()=>true});
  const res=response();
  await handler({method:"PATCH",body:{eventId:9101,event:event(after)}},res);
  assert.equal(res.statusCode,409);
  assert.equal(mock.calls.length,0,"must not mutate event or rooms");
 }
});
test("editing within the same cleaning category remains available for admin",async()=>{
 const mock=makeDb("活動");
 const handler=createEventHandler({dbFactory:()=>mock.db,sessionReader:async()=>admin,originAllowed:()=>true});
 const res=response();
 await handler({method:"PATCH",body:{eventId:9101,event:event("住宿")}},res);
 assert.equal(res.statusCode,200);
 assert.equal(mock.calls.length,1);
});
test("unauthenticated or cleaner accounts cannot create events",async()=>{
 const mock=makeDb();
 for(const actor of [null,cleaner]){
  const handler=createEventHandler({dbFactory:()=>mock.db,sessionReader:async()=>actor,originAllowed:()=>true});
  const res=response();
  await handler({method:"POST",body:{event:event()}},res);
  assert.equal(res.statusCode,actor?403:401);
 }
 assert.equal(mock.calls.length,0);
});

test("spoofed admin role on cleaner ID cannot mutate events or access database",async()=>{
 let dbReads=0;
 const handler=createEventHandler({originAllowed:()=>true,sessionReader:async()=>({user:{role:"admin",id:"cleaner-901"}}),dbFactory:()=>{dbReads++;throw Error("Forbidden DB use");}});
 const res=response();
 await handler({method:"POST",body:{event:event()}},res);
 assert.equal(res.statusCode,403);
 assert.equal(dbReads,0);
});

test("release-mode admin can edit existing non-QA events while QA remains protected",async()=>{
 const make=(scope)=>{
  let writes=0;
  const db={from(table){assert.equal(table,"events");return {
   select(){return this;},eq(){return this;},
   maybeSingle(){return Promise.resolve({data:{id:19,event_name:"原有活動",event_type:"活動"},error:null});},
   update(){writes++;return this;}
  };}};
  return {db,getWrites:()=>writes};
 };
 for(const [scope,expected] of [["qa",403],["production",200]]){
  const mock=make(scope);
  const handler=createEventHandler({releaseScope:scope,dbFactory:()=>mock.db,
   sessionReader:async()=>admin,originAllowed:()=>true});
  const res=response();
  await handler({method:"PATCH",body:{eventId:19,event:{...event(),event_name:"原有活動"}}},res);
  assert.equal(res.statusCode,expected);
  assert.equal(mock.getWrites(),scope==="production"?1:0);
 }
});

test("legacy edit and delete endpoints delegate to canonical event checks",async()=>{
 const calls=[];
 const canonical=async(req,res)=>{
  calls.push({method:req.method,eventId:req.body?.eventId,event:req.body?.event});
  return res.status(200).json({ok:true});
 };
 const update=createLegacyEventUpdateHandler({eventHandler:canonical});
 const deletion=createLegacyEventDeleteHandler({eventHandler:canonical});
 const edited=response();
 await update({method:"POST",body:{id:19,event:event()}},edited);
 assert.equal(edited.statusCode,200);
 assert.deepEqual(calls[0],{method:"PATCH",eventId:19,event:event()});
 const removed=response();
 await deletion({method:"POST",body:{id:20}},removed);
 assert.equal(removed.statusCode,200);
 assert.deepEqual(calls[1],{method:"DELETE",eventId:20,event:undefined});
 const unsupported=response();
 await deletion({method:"DELETE",body:{id:20}},unsupported);
 assert.equal(unsupported.statusCode,405);
 assert.equal(calls.length,2);
});

test("primary and legacy event deletion reject photo evidence before mutation",async()=>{
 let deleted=0;
 const db={
  from(table) {
   if(table==="events")return {
    select(){return this;},eq(){return this;},
    async maybeSingle(){return {data:{id:19,event_name:"正式活動",event_type:"活動"},error:null};},
   };
   if(table==="event_rooms")return {
    select(){return this;},eq(){return this;},or(){return this;},
    async limit(){return {data:[{id:101}],error:null};},
   };
   throw Error("unexpected table");
  },
  rpc(){deleted++;return {data:true,error:null};},
 };
 const canonical=createEventHandler({dbFactory:()=>db,sessionReader:async()=>admin,
  originAllowed:()=>true,releaseScope:"production"});
 const legacy=createLegacyEventDeleteHandler({eventHandler:canonical});
 for(const [fn,request] of [
  [canonical,{method:"DELETE",body:{eventId:19}}],
  [legacy,{method:"POST",body:{id:19}}],
 ]){
   const res=response();
   await fn(request,res);
   assert.equal(res.statusCode,409);
   assert.match(res.body.error,/photos/);
 }
 assert.equal(deleted,0);
});

test("legacy updates inherit primary cleaning-type migration rejection",async()=>{
 let writes=0;
 const db={from(table){
  assert.equal(table,"events");
  return {select(){return this;},eq(){return this;},
   async maybeSingle(){return {data:{id:19,event_name:"正式活動",event_type:"活動"},error:null};},
   update(){writes++;return this;},
  };
 }};
 const canonical=createEventHandler({dbFactory:()=>db,sessionReader:async()=>admin,
  originAllowed:()=>true,releaseScope:"production"});
 const legacy=createLegacyEventUpdateHandler({eventHandler:canonical});
 const res=response();
 await legacy({method:"POST",body:{id:19,event:{...event("一般活動"),event_name:"正式活動"}}},res);
 assert.equal(res.statusCode,409);
 assert.equal(writes,0);
});
