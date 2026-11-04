import test from "node:test";
import assert from "node:assert/strict";
import {createLoginHandler} from "../api/auth/login.js";
import {createCleanersHandler} from "../api/data/cleaners.js";

function response(){
  const headers={};
  return {
    headers, statusCode:null, body:null,
    setHeader(k,v){headers[k.toLowerCase()]=v;},
    status(n){this.statusCode=n;return this;},
    json(value){this.body=value;return this;},
  };
}
const TOKEN="a".repeat(64);
const originAllowed=()=>true;
function loginMock(result,insertError=null){
  const activity={rpc:0,insert:0};
  const db={
    async rpc(){activity.rpc++;return result;},
    from(table){
      assert.equal(table,"hk_auth_sessions");
      return {async insert(row){
        activity.insert++;
        assert.equal(row.user_id,"cleaner-901");
        assert.match(row.token_hash,/^[0-9a-f]{64}$/);
        return {error:insertError};
      }};
    },
  };
  return {activity,db,handler:createLoginHandler({
    dbFactory:()=>db,originAllowed,issueToken:()=>TOKEN,
    now:()=>Date.UTC(2026,10,4),
  })};
}
test("login: invalid PIN result is 401 and never issues cookie or inserts session",async()=>{
  const mock=loginMock({data:[],error:null});
  const res=response();
  await mock.handler({method:"POST",body:{userId:"cleaner-901",pin:"00000000"}},res);
  assert.equal(res.statusCode,401);
  assert.equal(res.headers["set-cookie"],undefined);
  assert.deepEqual(mock.activity,{rpc:1,insert:0});
});
test("login: mismatched RPC verified ID is rejected without creating cookie",async()=>{
  const mock=loginMock({data:[{verified_user_id:"admin"}],error:null});
  const res=response();
  await mock.handler({method:"POST",body:{userId:"cleaner-901",pin:"12345678"}},res);
  assert.equal(res.statusCode,401);
  assert.equal(mock.activity.insert,0);
  assert.equal(res.headers["set-cookie"],undefined);
});
test("login: valid identity gets HttpOnly Secure Strict cookie only after session insert",async()=>{
  const mock=loginMock({data:[{verified_user_id:"cleaner-901"}],error:null});
  const res=response();
  await mock.handler({method:"POST",body:{userId:"cleaner-901",pin:"12345678"}},res);
  assert.equal(res.statusCode,200);
  assert.equal(mock.activity.insert,1);
  assert.match(res.headers["set-cookie"],/__Host-hk_session=/);
  assert.match(res.headers["set-cookie"],/HttpOnly/);
  assert.match(res.headers["set-cookie"],/Secure/);
  assert.match(res.headers["set-cookie"],/SameSite=Strict/);
  assert.equal(res.headers["cache-control"],"no-store");
});
test("login: failed DB session insert never sets cookie",async()=>{
  const mock=loginMock({data:[{verified_user_id:"cleaner-901"}],error:null},{message:"insertion failed"});
  const res=response();
  await mock.handler({method:"POST",body:{userId:"cleaner-901",pin:"12345678"}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.headers["set-cookie"],undefined);
});
test("login: cross-site and malformed input rejected before touching database",async()=>{
  let requests=0;
  const handler=createLoginHandler({dbFactory:()=>{requests++;throw new Error("must not call");},
    originAllowed:()=>false});
  const res=response();
  await handler({method:"POST",body:{userId:"cleaner-901",pin:"12345678"}},res);
  assert.equal(res.statusCode,403);
  assert.equal(requests,0);
  const handler2=createLoginHandler({dbFactory:()=>{requests++;throw new Error("must not call");},originAllowed});
  const bad=response();
  await handler2({method:"POST",body:{userId:"cleaner-xxx",pin:"bad"}},bad);
  assert.equal(bad.statusCode,400);
  assert.equal(requests,0);
});
test("cleaner management: anonymous GET and POST return 401 without DB reads or writes",async()=>{
  let calls=0;
  const handler=createCleanersHandler({
    sessionReader:async()=>null,originAllowed,
    dbFactory:()=>{calls++;throw new Error("must not call");},
  });
  for(const method of ["GET","POST"]){
    const res=response();
    await handler({method,body:{name:"【權限驗收】測試員"}},res);
    assert.equal(res.statusCode,401);
  }
  assert.equal(calls,0);
});
test("cleaner management: cleaner role GET/POST/PATCH get 403 without DB calls",async()=>{
  let calls=0;
  const handler=createCleanersHandler({
    sessionReader:async()=>({user:{id:"cleaner-901",role:"cleaner"}}),
    originAllowed,
    dbFactory:()=>{calls++;throw new Error("must not call");},
  });
  for(const method of ["GET","POST","PATCH"]){
    const res=response();
    await handler({method,body:{name:"【權限驗收】測試員"}},res);
    assert.equal(res.statusCode,403);
  }
  assert.equal(calls,0);
});
test("cleaner management: cross-origin management rejects before session or DB query",async()=>{
  let calls=0;
  const handler=createCleanersHandler({
    sessionReader:async()=>{calls++;return null;},
    originAllowed:()=>false,
    dbFactory:()=>{calls++;throw new Error("must not call");},
  });
  const res=response();
  await handler({method:"POST",body:{}},res);
  assert.equal(res.statusCode,403);
  assert.equal(calls,0);
});
test("cleaner management: real names cannot be created via QA API even by admin",async()=>{
  let calls=0;
  const handler=createCleanersHandler({
    sessionReader:async()=>({user:{id:"admin",role:"admin"}}),
    originAllowed,
    dbFactory:()=>{calls++;throw new Error("must not call");},
  });
  const res=response();
  await handler({method:"POST",body:{name:"正式房務員"}},res);
  assert.equal(res.statusCode,400);
  assert.equal(calls,0);
});
test("cleaner management: QA admin performs exactly one server RPC with validated inputs",async()=>{
  const calls=[];
  const handler=createCleanersHandler({
    sessionReader:async()=>({user:{id:"admin",role:"admin"}}),originAllowed,
    dbFactory:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:7101,error:null};}}),
  });
  const res=response();
  await handler({method:"POST",body:{name:"【權限驗收】新增員"}},res);
  assert.equal(res.statusCode,201);
  assert.equal(res.body.cleanerId,7101);
  assert.deepEqual(calls,[{
    name:"hk_qa_manage_cleaner",
    args:{p_action:"create",p_cleaner_id:null,p_name:"【權限驗收】新增員"},
  }]);
});
