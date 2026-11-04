import test from "node:test";
import assert from "node:assert/strict";
import {manageQaCleaner,verifyDisabledCleaner} from "../api/_lib/qaCleanerManagement.js";

/**
 * Memory-only reproduction of the *documented* QA RPC lifecycle contract.
 * No Supabase client, no real PIN, no network, no mutation of existing QA data.
 */
function createSandbox(){
  let nextId=70001;
  const cleaners=new Map(),accounts=new Map(),sessions=new Map(),rooms=new Map();
  const rpc=async(name,params)=>{
    if(name!=="hk_qa_manage_cleaner")return {data:null,error:{message:"disallowed"}};
    const {p_action,p_name,p_cleaner_id}=params;
    if(p_action==="create"){
      const id=nextId++;
      cleaners.set(id,{id,name:p_name,is_active:false});
      accounts.set(id,{user_id:`cleaner-${id}`,display_name:p_name,active:false,pin:null,role:"cleaner"});
      return {data:id,error:null};
    }
    const cleaner=cleaners.get(p_cleaner_id),account=accounts.get(p_cleaner_id);
    if(!cleaner||!account||!cleaner.name.startsWith("【權限驗收】"))
      return {data:null,error:{message:"invalid cleaner"}};
    if(p_action==="rename"){
      cleaner.name=p_name;
      account.display_name=p_name;
      for(const room of rooms.values())if(room.cleaner_id===p_cleaner_id)room.assigned_to=p_name;
    }else if(p_action==="disable"){
      cleaner.is_active=false;
      account.active=false;
      for(const session of sessions.values())if(session.cleanerId===p_cleaner_id&&!session.revoked_at)
        session.revoked_at="2026-11-04T00:00:00Z";
    }else return {data:null,error:{message:"invalid action"}};
    return {data:p_cleaner_id,error:null};
  };
  const provision=(id,pin,role)=>{
    if(role!=="admin"||!/^[0-9]{8,32}$/.test(pin))return false;
    const cleaner=cleaners.get(id),account=accounts.get(id);
    if(!cleaner||!account||!cleaner.name.startsWith("【權限驗收】"))return false;
    cleaner.is_active=true;account.active=true;account.pin=pin;return true;
  };
  const login=(id,pin)=>{
    const cleaner=cleaners.get(id),account=accounts.get(id);
    if(!cleaner?.is_active||!account?.active||account.pin!==pin)return null;
    const token=`mock-session-${sessions.size+1}`;
    sessions.set(token,{cleanerId:id,revoked_at:null,expires_at:"2099-01-01T00:00:00Z"});
    return token;
  };
  const sessionValid=token=>{
    const s=sessions.get(token);
    return !!s && !s.revoked_at && new Date(s.expires_at)>new Date() &&
      cleaners.get(s.cleanerId)?.is_active===true &&
      accounts.get(s.cleanerId)?.active===true;
  };
  return {cleaners,accounts,sessions,rooms,rpc,provision,login,sessionValid};
}

test("full mock lifecycle: create disabled, admin PIN, login, assign, rename, disable, revoke and preserve room",async()=>{
  const db=createSandbox();
  const created=await manageQaCleaner({
    role:"admin",method:"POST",body:{name:"【權限驗收】專用隔離生命週期"},rpc:db.rpc,
  });
  assert.equal(created.status,201);
  const id=created.body.cleanerId;
  assert.equal(db.cleaners.get(id).is_active,false);
  assert.equal(db.accounts.get(id).active,false);
  assert.equal(db.login(id,"58390726"),null,"new account must not log in without provisioning");
  assert.equal(db.provision(id,"58390726","cleaner"),false);
  assert.equal(db.provision(id,"58390726","admin"),true);
  const token=db.login(id,"58390726");
  assert.ok(token);
  assert.equal(db.sessionValid(token),true);
  db.rooms.set(99999,{id:99999,event_id:9200,cleaner_id:id,
    assigned_to:db.cleaners.get(id).name,checklist:[{id:"flooring",done:true}],progress:25});
  const rename=await manageQaCleaner({
    role:"admin",method:"PATCH",
    body:{action:"rename",cleanerId:id,name:"【權限驗收】專用改名"},rpc:db.rpc,
  });
  assert.equal(rename.status,200);
  assert.equal(db.rooms.get(99999).assigned_to,"【權限驗收】專用改名");
  assert.equal(db.rooms.get(99999).progress,25);
  const denied=await manageQaCleaner({
    role:"cleaner",method:"PATCH",body:{action:"disable",cleanerId:id},rpc:db.rpc,
  });
  assert.equal(denied.status,403);
  assert.equal(db.sessionValid(token),true);
  const disabled=await manageQaCleaner({
    role:"admin",method:"PATCH",body:{action:"disable",cleanerId:id},rpc:db.rpc,
  });
  assert.equal(disabled.status,200);
  assert.equal(db.sessionValid(token),false);
  assert.equal(db.login(id,"58390726"),null);
  assert.equal(verifyDisabledCleaner({
    cleaner:db.cleaners.get(id),account:db.accounts.get(id),
    sessions:[db.sessions.get(token)],
  }),true);
  assert.equal(db.rooms.get(99999).cleaner_id,id);
  assert.equal(db.rooms.get(99999).progress,25);
  assert.deepEqual(db.rooms.get(99999).checklist,[{id:"flooring",done:true}]);
});

test("manager route refuses non-QA identities and does not write sandbox tables",async()=>{
  const db=createSandbox();
  const result=await manageQaCleaner({
    role:"admin",method:"POST",body:{name:"正式人員"},rpc:db.rpc,
  });
  assert.equal(result.status,400);
  assert.equal(db.cleaners.size,0);
  assert.equal(db.accounts.size,0);
});

test("mock disable rejects unknown cleaner without altering room history",async()=>{
  const db=createSandbox();
  db.rooms.set(1,{id:1,cleaner_id:901,assigned_to:"原有房務",progress:100});
  const result=await manageQaCleaner({
    role:"admin",method:"PATCH",body:{action:"disable",cleanerId:99999},rpc:db.rpc,
  });
  assert.equal(result.status,400);
  assert.equal(db.rooms.get(1).progress,100);
});
