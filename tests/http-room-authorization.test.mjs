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

test("photo upload refuses unsupported categories before touching room data or storage",async()=>{
 const mock=mockRoomDb();
 const handler=createRoomsHandler({originAllowed:()=>true,sessionReader:async()=>admin,
   dbFactory:()=>mock.db});
 for(const itemId of ["final","final_photo","surface_cleaning","__proto__","constructor","bathroom/../flooring",""]){
   const res=response();
   await handler({method:"POST",body:{roomId:701,itemId,mime:"image/png",base64:"iVBORw0KGgo="}},res);
   assert.equal(res.statusCode,400,itemId);
 }
 assert.equal(mock.calls.length,0);
});
