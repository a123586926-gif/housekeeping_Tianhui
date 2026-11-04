import test from "node:test";
import assert from "node:assert/strict";
import {createSessionHandler} from "../api/auth/session.js";
import {createLogoutHandler} from "../api/auth/logout.js";

function response(){
 const headers={};
 return {headers,statusCode:null,body:null,
   setHeader(k,v){headers[k.toLowerCase()]=v;},
   status(n){this.statusCode=n;return this;},
   json(v){this.body=v;return this;},
 };
}
const ADMIN={user:{id:"admin",role:"admin",name:"測試管理員"},expiresAt:"2026-12-03T00:00:00Z"};
const CLEANER={user:{id:"cleaner-901",role:"cleaner",name:"測試房務"},expiresAt:"2026-12-03T00:00:00Z"};
test("session GET without login does not query DB and reports unauthenticated",async()=>{
 let count=0;
 const handler=createSessionHandler({sessionReader:async()=>null,
   dbFactory:()=>{count++;throw Error("not needed");}});
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.body,{authenticated:false});
 assert.equal(count,0);
});
test("session POST and PATCH require login (401) and correct origin (403)",async()=>{
 let called=0;
 const handler=createSessionHandler({sessionReader:async()=>null,originAllowed:()=>true,
   dbFactory:()=>{called++;throw Error("never");}});
 for(const method of ["POST","PATCH"]){
   const res=response();
   await handler({method,body:{}},res);
   assert.equal(res.statusCode,401);
 }
 const forbidden=createSessionHandler({
   sessionReader:async()=>{called++;return ADMIN;},
   originAllowed:()=>false,dbFactory:()=>{called++;throw Error("never");},
 });
 const bad=response();
 await forbidden({method:"POST",body:{}},bad);
 assert.equal(bad.statusCode,403);
 assert.equal(called,0);
});
test("nonadmin cannot provision another cleaner PIN",async()=>{
 let rpcCalls=0;
 const handler=createSessionHandler({
   sessionReader:async()=>CLEANER,originAllowed:()=>true,
   dbFactory:()=>({rpc:async()=>{rpcCalls++;return {data:true,error:null};}}),
 });
 const res=response();
 await handler({method:"POST",body:{cleanerId:902,newPin:"82930146"}},res);
 assert.equal(res.statusCode,403);
 assert.equal(rpcCalls,0);
});
test("admin provisioning rejects weak PIN and invalid IDs before RPC",async()=>{
 let rpcCalls=0;
 const handler=createSessionHandler({
   sessionReader:async()=>ADMIN,originAllowed:()=>true,
   dbFactory:()=>({rpc:async()=>{rpcCalls++;return {data:true,error:null};}}),
 });
 for(const body of [
  {cleanerId:901,newPin:"1234"},
  {cleanerId:"901",newPin:"82930146"},
  {cleanerId:0,newPin:"82930146"},
 ]){
   const res=response();
   await handler({method:"POST",body},res);
   assert.equal(res.statusCode,400);
 }
 assert.equal(rpcCalls,0);
});
test("only QA provisioning RPC success returns 200",async()=>{
 const calls=[];
 const handler=createSessionHandler({
   sessionReader:async()=>ADMIN,originAllowed:()=>true,
   dbFactory:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null};}}),
 });
 const res=response();
 await handler({method:"POST",body:{cleanerId:901,newPin:"82930146"}},res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(calls,[{
   name:"hk_qa_provision_pin",
   args:{p_cleaner_id:901,p_new_pin:"82930146"},
 }]);
 assert.equal(res.headers["set-cookie"],undefined);
});
test("own PIN change revokes existing cookie on success",async()=>{
 const calls=[];
 const handler=createSessionHandler({
   sessionReader:async()=>CLEANER,originAllowed:()=>true,
   dbFactory:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null};}}),
 });
 const res=response();
 await handler({method:"PATCH",body:{oldPin:"24681012",newPin:"82930146"}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.signedOut,true);
 assert.deepEqual(calls,[{
   name:"hk_change_own_pin",
   args:{p_user_id:"cleaner-901",p_old_pin:"24681012",p_new_pin:"82930146"},
 }]);
 assert.match(res.headers["set-cookie"],/Max-Age=0/);
 assert.match(res.headers["set-cookie"],/HttpOnly/);
});
test("wrong old PIN never clears cookie or signs user out",async()=>{
 const handler=createSessionHandler({
   sessionReader:async()=>CLEANER,originAllowed:()=>true,
   dbFactory:()=>({rpc:async()=>({data:false,error:null})}),
 });
 const res=response();
 await handler({method:"PATCH",body:{oldPin:"11111111",newPin:"82930146"}},res);
 assert.equal(res.statusCode,401);
 assert.equal(res.headers["set-cookie"],undefined);
});
test("logout removes session via hash and clears cookie only on success",async()=>{
 const token="a".repeat(64),calls=[];
 const handler=createLogoutHandler({originAllowed:()=>true,cookieReader:()=>token,
   dbFactory:()=>({from(table){
     assert.equal(table,"hk_auth_sessions");
     return {update(patch){calls.push(["update",patch]);return {
       async eq(field,hash){calls.push(["eq",field,hash]);return {error:null};},
     };}};
   }}),
   now:()=>new Date("2026-11-04T00:00:00Z"),
 });
 const res=response();
 await handler({method:"POST"},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.authenticated,false);
 assert.equal(calls[0][0],"update");
 assert.equal(calls[1][1],"token_hash");
 assert.match(calls[1][2],/^[0-9a-f]{64}$/);
 assert.match(res.headers["set-cookie"],/Max-Age=0/);
});
test("logout database revocation errors leave cookie intact and return 503",async()=>{
 const handler=createLogoutHandler({originAllowed:()=>true,cookieReader:()=>"a".repeat(64),
   dbFactory:()=>({from:()=>({update:()=>({eq:async()=>({error:{message:"failure"}})})})}),
 });
 const res=response();
 await handler({method:"POST"},res);
 assert.equal(res.statusCode,503);
 assert.equal(res.headers["set-cookie"],undefined);
});
test("logout with no cookie is idempotent and clears stale browser state",async()=>{
 let called=0;
 const handler=createLogoutHandler({originAllowed:()=>true,cookieReader:()=>null,
   dbFactory:()=>{called++;throw Error("unneeded");},
 });
 const res=response();
 await handler({method:"POST"},res);
 assert.equal(res.statusCode,200);
 assert.equal(called,0);
 assert.match(res.headers["set-cookie"],/Max-Age=0/);
});

test("spoofed admin role cannot provision PIN or query DB",async()=>{
 let accesses=0;
 const handler=createSessionHandler({originAllowed:()=>true,sessionReader:async()=>({user:{role:"admin",id:"cleaner-901"}}),dbFactory:()=>{accesses++;throw Error("Unexpected DB");}});
 const res=response();
 await handler({method:"POST",body:{cleanerId:902,newPin:"82930146"}},res);
 assert.equal(res.statusCode,403);
 assert.equal(accesses,0);
});
