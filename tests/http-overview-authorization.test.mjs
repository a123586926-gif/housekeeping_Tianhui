import test from "node:test";
import assert from "node:assert/strict";
import {createOverviewHandler,collectPagedRows} from "../api/data/overview.js";

function response(){
 const headers={};
 return {headers,statusCode:null,body:null,
   setHeader(k,v){headers[k.toLowerCase()]=v;},
   status(n){this.statusCode=n;return this;},
   json(v){this.body=v;return this;},
 };
}
const EVENTS=[
 {id:101,event_date:"2026-11-04",event_name:"活動A",event_type:"活動",notes:"敏感備註A"},
 {id:102,event_date:"2026-11-05",event_name:"活動B",event_type:"住宿",notes:"敏感備註B"},
];
const ROOMS=[
 {id:1,event_id:101,cleaner_id:901,room_no:"201"},
 {id:2,event_id:101,cleaner_id:902,room_no:"202"},
 {id:3,event_id:102,cleaner_id:902,room_no:"301"},
];
function makeDatabase(){
 const calls=[];
 const db={
   from(table){
     calls.push(["from",table]);
     const q={
       filter:null,
       select(){return this;},
       order(){return this;},
       eq(key,val){calls.push(["eq",key,val]);this.filter={key,val};return this;},
       range(from,to){calls.push(["range",from,to]);this.from=from;this.to=to;return this;},
       then(resolve,reject){
         const source=table==="events"?EVENTS:table==="event_rooms"?ROOMS:[];
         const rows=this.filter?source.filter(r=>r[this.filter.key]===this.filter.val):source;
         const data=rows.slice(this.from ?? 0,(this.to ?? rows.length-1)+1);
         return Promise.resolve({data,error:null}).then(resolve,reject);
       },
     };
     return q;
   },
 };
 return {db,calls};
}
test("unauthenticated cannot request overview (401), database not queried",async()=>{
 let called=false;
 const handler=createOverviewHandler({
   dbFactory:()=>{called=true;throw Error("should not read");},
   sessionReader:async()=>null,
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,401);
 assert.equal(called,false);
});
test("unsupported method returns 405 without account or DB access",async()=>{
 let called=false;
 const handler=createOverviewHandler({
   dbFactory:()=>{called=true;throw Error("should not read");},
   sessionReader:async()=>{called=true;return null;},
 });
 const res=response();
 await handler({method:"POST"},res);
 assert.equal(res.statusCode,405);
 assert.equal(called,false);
});
test("admin receives full room list and original event notes",async()=>{
 const mock=makeDatabase();
 const handler=createOverviewHandler({
   dbFactory:()=>mock.db,
   sessionReader:async()=>({user:{id:"admin",role:"admin"}}),
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.eventRooms.length,3);
 assert.equal(res.body.events.length,2);
 assert.equal(res.body.events[0].notes,"敏感備註A");
 assert.equal(res.body.calendarEvents.length,2);
 assert.ok(!mock.calls.some(x=>x[0]==="eq"));
});
test("cleaner 901 receives only own assigned room, never cleaner 902 rooms",async()=>{
 const mock=makeDatabase();
 const handler=createOverviewHandler({
   dbFactory:()=>mock.db,
   sessionReader:async()=>({user:{id:"cleaner-901",role:"cleaner"}}),
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.body.eventRooms.map(x=>x.id),[1]);
 assert.deepEqual(res.body.events.map(x=>x.id),[101]);
 assert.equal(res.body.events[0].notes,"");
 assert.deepEqual(res.body.calendarEvents.map(x=>x.id),[101,102]);
 assert.ok(mock.calls.some(x=>x[0]==="eq"&&x[1]==="cleaner_id"&&x[2]===901));
});
test("cleaner 902 cannot see room 901 or its owner data",async()=>{
 const mock=makeDatabase();
 const handler=createOverviewHandler({
   dbFactory:()=>mock.db,
   sessionReader:async()=>({user:{id:"cleaner-902",role:"cleaner"}}),
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(res.body.eventRooms.map(x=>x.id),[2,3]);
 assert.deepEqual(res.body.events.map(x=>x.id),[101,102]);
 assert.equal(res.body.events.every(e=>e.notes===""),true);
});
test("unknown role receives 403 and no room data",async()=>{
 const mock=makeDatabase();
 const handler=createOverviewHandler({
   dbFactory:()=>mock.db,
   sessionReader:async()=>({user:{id:"external",role:"guest"}}),
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,403);
 assert.equal(res.body.eventRooms,undefined);
});
test("DB read failure cannot return partial room data",async()=>{
 const handler=createOverviewHandler({
   sessionReader:async()=>({user:{id:"admin",role:"admin"}}),
   dbFactory:()=>({from:()=>{throw Error("simulated unavailable");}}),
 });
 const res=response();
 await handler({method:"GET"},res);
 assert.equal(res.statusCode,503);
 assert.equal(res.body.events,undefined);
});

test("pagination reads multiple pages completely without silently hiding rows",async()=>{
 const source=Array.from({length:1201},(_,index)=>({id:index+1}));
 const calls=[];
 const rows=await collectPagedRows(()=>({
   async range(from,to){calls.push([from,to]);return {data:source.slice(from,to+1),error:null};},
 }),{pageSize:500,maxPages:5});
 assert.equal(rows.length,1201);
 assert.equal(rows.at(-1).id,1201);
 assert.deepEqual(calls,[[0,499],[500,999],[1000,1499]]);
});
test("pagination returns 503-style error rather than incomplete data on page error",async()=>{
 let pages=0;
 await assert.rejects(
   ()=>collectPagedRows(()=>({
     async range(){pages++;return pages===2
       ? {data:null,error:new Error("Simulated network failure")}
       : {data:Array.from({length:2},(_,i)=>({id:i+1})),error:null};},
   }),{pageSize:2,maxPages:4}),
   /Simulated network failure/,
 );
});
test("pagination refuses to represent a truncated max-page response as complete",async()=>{
 await assert.rejects(
   ()=>collectPagedRows(()=>({async range(){return {data:[{id:1},{id:2}],error:null}}}),
     {pageSize:2,maxPages:2}),
   /exceeds the validated pagination limit/,
 );
});
test("invalid or malformed cleaner identity is rejected before querying events",async()=>{
 for(const user of [
   {id:"cleaner-abc",role:"cleaner"}, {id:"cleaner-001",role:"cleaner"},
   {id:"cleaner-0",role:"cleaner"}, {id:"cleaner-1",role:"admin"},
   {id:"admin",role:"cleaner"},
 ]){
   let calls=0;
   const handler=createOverviewHandler({sessionReader:async()=>({user}),
     dbFactory:()=>{calls++;throw Error("DB must not be accessed");}});
   const res=response();
   await handler({method:"GET"},res);
   assert.equal(res.statusCode,403);
   assert.equal(calls,0);
 }
});

test("complete overview preserves every room after first result page and filters cleaner ownership",async()=>{
 const manyRooms=Array.from({length:1201},(_,i)=>({
   id:i+1,event_id:101,cleaner_id:i%2===0?901:902,room_no:String(i+1),
 }));
 function dbFactory(){
   return {
     from(table){
       const source=table==="events"?EVENTS:manyRooms;
       const q={filter:null,
         select(){return this;},
         order(){return this;},
         eq(field,value){this.filter={field,value};return this;},
         async range(start,end){
           const filtered=this.filter?source.filter(x=>x[this.filter.field]===this.filter.value):source;
           return {data:filtered.slice(start,end+1),error:null};
         },
       };
       return q;
     },
   };
 }
 const adminRes=response();
 await createOverviewHandler({dbFactory,sessionReader:async()=>({user:{role:"admin",id:"admin"}})})
   ({method:"GET"},adminRes);
 assert.equal(adminRes.statusCode,200);
 assert.equal(adminRes.body.eventRooms.length,1201);
 assert.equal(adminRes.body.events.length,2);
 const cleanerRes=response();
 await createOverviewHandler({dbFactory,sessionReader:async()=>({user:{role:"cleaner",id:"cleaner-901"}})})
   ({method:"GET"},cleanerRes);
 assert.equal(cleanerRes.statusCode,200);
 assert.equal(cleanerRes.body.eventRooms.length,601);
 assert.equal(cleanerRes.body.eventRooms.every(x=>x.cleaner_id===901),true);
 assert.deepEqual(cleanerRes.body.events.map(x=>x.id),[101]);
 assert.equal(cleanerRes.body.calendarEvents.length,2);
});
