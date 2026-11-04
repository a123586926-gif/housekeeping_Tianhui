import test from "node:test";
import assert from "node:assert/strict";
import {manageQaCleaner,verifyDisabledCleaner} from "../api/_lib/qaCleanerManagement.js";

function fakeRpc(){
  const calls=[];
  const rpc=async(name,args)=>{
    calls.push({name,args});
    return {data:args.p_cleaner_id??701,error:null};
  };
  return {calls,rpc};
}
test("admin can create QA cleaner with safe name; no PIN or role supplied to RPC",async()=>{
  const db=fakeRpc();
  const result=await manageQaCleaner({
    role:"admin",method:"POST",body:{name:"【權限驗收】測試員"},
    rpc:db.rpc,
  });
  assert.deepEqual(result,{status:201,body:{ok:true,cleanerId:701}});
  assert.deepEqual(db.calls,[{
    name:"hk_qa_manage_cleaner",
    args:{p_action:"create",p_cleaner_id:null,p_name:"【權限驗收】測試員"},
  }]);
  assert.equal(JSON.stringify(db.calls).includes("pin"),false);
});
test("rename preserves immutable cleaner ID and caller role can't elevate permissions",async()=>{
  const db=fakeRpc();
  const result=await manageQaCleaner({
    role:"admin",method:"PATCH",
    body:{action:"rename",cleanerId:701,name:"【權限驗收】修改後"},
    rpc:db.rpc,
  });
  assert.equal(result.status,200);
  assert.equal(result.body.cleanerId,701);
  assert.equal(db.calls[0].args.p_cleaner_id,701);
});
test("disable uses atomic QA RPC, never deletes cleaner rows or changes room assignments",async()=>{
  const db=fakeRpc();
  const result=await manageQaCleaner({
    role:"admin",method:"PATCH",body:{action:"disable",cleanerId:701},
    rpc:db.rpc,
  });
  assert.equal(result.status,200);
  assert.deepEqual(db.calls[0].args,{p_action:"disable",p_cleaner_id:701,p_name:""});
});
test("cleaner and anonymous access fail before any RPC call",async()=>{
  const db=fakeRpc();
  for(const role of ["cleaner",null,"other"]){
    const result=await manageQaCleaner({role,method:"POST",
      body:{name:"【權限驗收】測試員"},rpc:db.rpc});
    assert.equal(result.status,403);
  }
  assert.equal(db.calls.length,0);
});
test("non-QA real staff names and malformed IDs never reach RPC",async()=>{
  const db=fakeRpc();
  const a=await manageQaCleaner({role:"admin",method:"POST",body:{name:"王阿姨"},rpc:db.rpc});
  const b=await manageQaCleaner({role:"admin",method:"PATCH",body:{action:"disable",cleanerId:"701"},rpc:db.rpc});
  assert.equal(a.status,400);
  assert.equal(b.status,400);
  assert.equal(db.calls.length,0);
});
test("RPC errors and nonpositive/empty results don't report success",async()=>{
  const input={role:"admin",method:"POST",body:{name:"【權限驗收】測試員"}};
  for(const r of [{data:null,error:null},{data:0,error:null},{data:null,error:{message:"no"}},{data:"invalid",error:null}]){
    const result=await manageQaCleaner({...input,rpc:async()=>r});
    assert.equal(result.status,400);
    assert.equal(result.body.ok,undefined);
  }
});
test("disable postcondition requires both account inactive and all sessions revoked or expired",()=>{
  const now=Date.now();
  const base={
    cleaner:{id:701,is_active:false},
    account:{active:false},
    sessions:[{revoked_at:new Date(now).toISOString(),expires_at:new Date(now+60_000).toISOString()}],
  };
  assert.equal(verifyDisabledCleaner(base),true);
  assert.equal(verifyDisabledCleaner({...base,account:{active:true}}),false);
  assert.equal(verifyDisabledCleaner({...base,cleaner:{is_active:true}}),false);
  assert.equal(verifyDisabledCleaner({...base,sessions:[{revoked_at:null,expires_at:new Date(now+60_000).toISOString()}]}),false);
  assert.equal(verifyDisabledCleaner({...base,sessions:[{revoked_at:null,expires_at:new Date(now-60_000).toISOString()}]}),true);
  assert.equal(verifyDisabledCleaner({...base,sessions:null}),false);
});
