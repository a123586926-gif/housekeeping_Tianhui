import test from "node:test";
import assert from "node:assert/strict";
import {getSession} from "../api/_lib/auth.js";

const TOKEN="a".repeat(64);
const VALID_EXPIRES="2099-01-01T00:00:00Z";
function req(token=TOKEN){return {headers:{cookie:token===null?"":`__Host-hk_session=${token}`}}}
function mockDb({session={user_id:"cleaner-901",revoked_at:null,expires_at:VALID_EXPIRES},
 account={user_id:"cleaner-901",display_name:"虛構房務",role:"cleaner",active:true},
 errorTable=null}={}){
 const calls=[];
 return {
  calls,
  db:{
   from(table){
    calls.push(["from",table]);
    return {
     select(columns){calls.push(["select",table,columns]);return this},
     eq(field,value){calls.push(["eq",table,field,value]);return this},
     async maybeSingle(){return {data:table==="hk_auth_sessions"?session:account,error:table===errorTable?{message:"mock failure"}:null}},
    };
   },
  },
 };
}
test("missing cookie never opens DB connection",async()=>{
 let calls=0;
 const session=await getSession(req(null),{dbFactory:()=>{calls++;throw Error("no db")}});
 assert.equal(session,null);assert.equal(calls,0);
});
test("malformed cookies are rejected before DB lookup",async()=>{
 let calls=0;
 const session=await getSession(req("not-a-valid-session"),{dbFactory:()=>{calls++;throw Error("no db")}});
 assert.equal(session,null);assert.equal(calls,0);
});
test("valid cookie requires both session and active matching account",async()=>{
 const m=mockDb();
 const result=await getSession(req(),{dbFactory:()=>m.db});
 assert.deepEqual(result.user,{id:"cleaner-901",name:"虛構房務",role:"cleaner"});
 assert.equal(result.expiresAt,VALID_EXPIRES);
 assert.match(result.tokenHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(m.calls.filter(x=>x[0]==="from").map(x=>x[1]),["hk_auth_sessions","hk_auth_accounts"]);
 assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="hk_auth_accounts"&&x[2]==="user_id"&&x[3]==="cleaner-901"));
});
test("revoked session cannot access account data",async()=>{
 const m=mockDb({session:{user_id:"cleaner-901",revoked_at:"2026-11-04T00:00:00Z",expires_at:VALID_EXPIRES}});
 assert.equal(await getSession(req(),{dbFactory:()=>m.db}),null);
});
test("expired session cannot access account data",async()=>{
 const m=mockDb({session:{user_id:"cleaner-901",revoked_at:null,expires_at:"2000-01-01T00:00:00Z"}});
 assert.equal(await getSession(req(),{dbFactory:()=>m.db}),null);
});
test("disabled account is rejected with existing unrevoked session",async()=>{
 const m=mockDb({account:{user_id:"cleaner-901",display_name:"虛構房務",role:"cleaner",active:false}});
 assert.equal(await getSession(req(),{dbFactory:()=>m.db}),null);
});
test("cross-account DB response is rejected; no user identity confusion",async()=>{
 const m=mockDb({account:{user_id:"cleaner-902",display_name:"另一位房務",role:"cleaner",active:true}});
 assert.equal(await getSession(req(),{dbFactory:()=>m.db}),null);
});
test("failed DB query returns null instead of authorizing request",async()=>{
 for(const errorTable of ["hk_auth_sessions","hk_auth_accounts"]){
  const m=mockDb({errorTable});
  assert.equal(await getSession(req(),{dbFactory:()=>m.db}),null);
 }
});
