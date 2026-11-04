import test from "node:test";
import assert from "node:assert/strict";
import {verifiedLoginIdentity,verifiedSessionPrincipal} from "../api/_lib/sessionAccess.js";

const NOW=1800000000000;
const expire=new Date(NOW+120000).toISOString();
function session(user_id="cleaner-901"){return {user_id,revoked_at:null,expires_at:expire}}
function account(user_id="cleaner-901"){return {user_id,role:"cleaner",active:true,display_name:"虛構測試房務"}}
test("only exact matching identity passes login RPC response",()=>{
 assert.equal(verifiedLoginIdentity([{verified_user_id:"cleaner-901"}],"cleaner-901"),true);
 assert.equal(verifiedLoginIdentity([{verified_user_id:"admin"}],"cleaner-901"),false);
 assert.equal(verifiedLoginIdentity([{verified_user_id:"cleaner-901"},{verified_user_id:"cleaner-901"}],"cleaner-901"),false);
 for(const value of [[],null,{},[null],[{}],[{verified_user_id:null}]])
   assert.equal(verifiedLoginIdentity(value,"cleaner-901"),false);
 assert.equal(verifiedLoginIdentity([{verified_user_id:"admin"}],"admin"),true);
});
test("active account and matching unrevoked session are usable",()=>{
 assert.deepEqual(verifiedSessionPrincipal(session(),account(),NOW),{
   user:{id:"cleaner-901",name:"虛構測試房務",role:"cleaner"},expiresAt:expire,
 });
});
test("anonymous and revoked credentials are rejected (401 equivalent)",()=>{
 assert.equal(verifiedSessionPrincipal(null,account(),NOW),null);
 assert.equal(verifiedSessionPrincipal(session(),null,NOW),null);
 assert.equal(verifiedSessionPrincipal({...session(),revoked_at:new Date(NOW-1000).toISOString()},account(),NOW),null);
});
test("disabled cleaner and invalid roles never inherit valid session (403 guard)",()=>{
 assert.equal(verifiedSessionPrincipal(session(),{...account(),active:false},NOW),null);
 assert.equal(verifiedSessionPrincipal(session(),{...account(),role:"admin"},NOW),null);
 assert.equal(verifiedSessionPrincipal(session(),{...account(),role:"owner"},NOW),null);
});
test("expired, missing, malformed expiration and future revocation all fail closed",()=>{
 for(const date of [undefined,null,"", "garbled",new Date(NOW).toISOString(),new Date(NOW-1).toISOString()]){
   assert.equal(verifiedSessionPrincipal({...session(),expires_at:date},account(),NOW),null);
 }
 assert.equal(verifiedSessionPrincipal({...session(),revoked_at:new Date(NOW+999999).toISOString()},account(),NOW),null);
});
test("changing browser cookie to another account token cannot cross identities",()=>{
 assert.equal(verifiedSessionPrincipal(session("cleaner-901"),account("cleaner-902"),NOW),null);
 assert.equal(verifiedSessionPrincipal(session("cleaner-902"),account("cleaner-901"),NOW),null);
});
test("invalid cleaner account IDs cannot be used to access other room ownership",()=>{
 for(const user_id of ["cleaner-0","cleaner-001","cleaner-abc","cleaner-1x","admin","cleaner--1"]){
   const s=session(user_id),a={...account(user_id),role:"cleaner"};
   assert.equal(verifiedSessionPrincipal(s,a,NOW),null);
 }
 const adminSession=session("admin"),adminAccount={...account("admin"),role:"admin"};
 assert.equal(verifiedSessionPrincipal(adminSession,adminAccount,NOW)?.user.role,"admin");
});
test("logout simulation requires session revocation; session removal never revives access",()=>{
 const s=session();
 assert.ok(verifiedSessionPrincipal(s,account(),NOW));
 assert.equal(verifiedSessionPrincipal({...s,revoked_at:new Date(NOW).toISOString()},account(),NOW),null);
 assert.equal(verifiedSessionPrincipal(undefined,account(),NOW),null);
});
test("blank identity and inactive account do not produce principal objects",()=>{
 assert.equal(verifiedSessionPrincipal(session(),{...account(),display_name:" "},NOW),null);
 assert.equal(verifiedSessionPrincipal(session(),{...account(),active:undefined},NOW),null);
});
