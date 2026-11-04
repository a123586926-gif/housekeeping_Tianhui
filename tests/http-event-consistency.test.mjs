import test from "node:test";
import assert from "node:assert/strict";
import {createEventHandler} from "../api/data/event-create.js";

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
