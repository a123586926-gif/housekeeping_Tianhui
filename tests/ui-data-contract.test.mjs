import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";

const app=fs.readFileSync(fileURLToPath(new URL("../src/App.tsx",import.meta.url)),"utf8");
const api=fs.readFileSync(fileURLToPath(new URL("../api/data/rooms.js",import.meta.url)),"utf8");

test("room assignment is scoped by immutable cleaner ID rather than display name",()=>{
 assert.match(app,/cleanerId:\s*room\.cleaner_id\s*\?\?\s*null/);
 assert.match(app,/room\.cleanerId\s*===\s*Number\(currentUser\.id\.slice/);
 assert.doesNotMatch(app,/room\.assignedTo\s*===\s*currentUser\.name/);
 assert.match(api,/existing\.cleaner_id\s*!==\s*cleanerId/);
});
test("photo upload pause does not block room checklist completion",()=>{
 assert.match(api,/req\.method\s*===\s*"POST"\)\s*return json\(res,\s*503/);
 assert.doesNotMatch(api,/if\s*\(item\.requiredPhoto\s*&&\s*!item\.photo\)\s*item\.done\s*=\s*false/);
 assert.match(api,/photo:\s*item\.photo/);
 assert.match(app,/photo:\s*item\.photo/);
});
test("admin summary and progress follow checklist and have filterable search",()=>{
 assert.match(app,/Array\.isArray\(room\.checklist\)\s*&&\s*room\.checklist\.length\s*>\s*0\s*\?\s*computeRoomStatus\(checklist\)/);
 assert.match(app,/const \[overviewSearch, setOverviewSearch\]/);
 assert.match(app,/placeholder="搜尋房號、房務人員、入住者"/);
});
test("local date sorting and printing remain usable for 6, 7, 8 or more people",()=>{
 assert.match(app,/todayStart\s*=\s*new Date\(today\.getFullYear\(\),\s*today\.getMonth\(\),\s*today\.getDate\(\)\)/);
 assert.match(app,/const useTwoColumns = guests\.length > 6/);
 assert.match(app,/const splitAt = Math\.ceil\(guests\.length \/ 2\)/);
 assert.match(app,/guests\.slice\(splitAt\)/);
 assert.match(app,/overflow-wrap:\s*anywhere/);
 assert.doesNotMatch(app,/guests\.slice\(4,\s*8\)/);
});

test("admin management uses cleaner IDs and mutations cannot be submitted twice",()=>{
 assert.match(app,/user\.dbId != null && room\.cleanerId === user\.dbId/);
 assert.match(app,/expandedStaffName === user\.id/);
 assert.match(app,/if\(currentUser\?\.role!=="admin" \|\| activityMutationBusy\.current\)return/);
 assert.match(app,/if\(currentUser\?\.role!=="admin" \|\| staffMutationBusy\.current\)return/);
 assert.match(app,/roomMutationBusy\.current=true/);
 assert.match(app,/createdRoomId\s*\?\s*"房間已建立/);
});

test("checklist writes are serialized per room to avoid rapid-click conflicts",()=>{
 assert.match(app,/checklistSavingRooms\.current\.has\(roomId\)/);
 assert.match(app,/checklistSavingRooms\.current\.add\(roomId\)/);
 assert.match(app,/checklistSavingRooms\.current\.delete\(roomId\)/);
 assert.match(app,/disabled=\{savingChecklistRoomIds\.includes\(room\.id\)\}/);
});
test("activity, room, staff modals cannot be dismissed during pending mutation",()=>{
 for(const name of ["activitySaving","roomSaving","staffSaving"]){
  assert.match(app,new RegExp("if\\(!"+name+"\\) setShow"));
 }
});

test("admin assignment dropdown sends immutable cleaner IDs",()=>{
 assert.match(app,/assignedCleanerId:\s*e\.target\.value\s*\?\s*Number\(e\.target\.value\)\s*:\s*null/);
 assert.match(app,/value=\{room\.cleanerId == null \? "" : String\(room\.cleanerId\)\}/);
 assert.match(app,/assignedCleanerId:Number\(newRoomStaff\)/);
 assert.doesNotMatch(app,/value=\{user\.name\}/);
});
