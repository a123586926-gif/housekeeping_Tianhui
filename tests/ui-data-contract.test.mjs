import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";

const app=fs.readFileSync(fileURLToPath(new URL("../src/App.tsx",import.meta.url)),"utf8");
const api=fs.readFileSync(fileURLToPath(new URL("../api/data/rooms.js",import.meta.url)),"utf8");
const auth=fs.readFileSync(fileURLToPath(new URL("../src/lib/authSession.ts",import.meta.url)),"utf8");

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
 assert.match(app,/if\(staffMutationBusy\.current\)/);
 assert.match(app,/setStaffButtonPresses\(x=>x\+1\)/);
 assert.match(app,/if\(currentUser\?\.role!=="admin"\)/);
 assert.match(app,/staffMutationBusy\.current=true/);
 assert.match(app,/roomMutationBusy\.current=true/);
 assert.match(app,/createdRoomId\s*\?\s*"房間已建立/);
});

test("rapid room checklists remain interactive and serialize writes with optimistic locks",()=>{
 const a=app.indexOf("async function flushChecklistQueue(");
 const b=app.indexOf("async function confirmPhotoUploadAndComplete()",a);
 const body=app.slice(a,b);
 assert.ok(a>=0 && b>a);
 assert.match(body,/pendingChecklistWrites\.current\.get\(roomId\)/);
 assert.match(body,/task\.writing=true/);
 assert.match(body,/while\(task\.epoch===dataEpoch\.current/);
 assert.match(body,/await updateRoomChecklist\(task\.dbId,checklistFlags\(next\),checklistFlags\(task\.committed\)\)/);
 assert.match(body,/task\.committed=next/);
 assert.match(body,/const desired=transform\(task\?\.desired\?\?room\.checklist\)/);
 assert.match(body,/setActivities\(prev=>prev\.map\(/);
 assert.match(body,/catch\(error\)[\s\S]*?await loadEventsFromSupabase\(\)/);
 assert.doesNotMatch(app,/disabled=\{savingChecklistRoomIds\.includes\(room\.id\)\}/);
 assert.match(app,/savingChecklistRoomIds\.includes\(room\.id\) && \(/);
 assert.match(app,/const pending = pendingChecklistWrites\.current\.get/);
 assert.match(app,/pendingChecklistWrites\.current\.clear\(\)/);
});
test("activity, room, staff modals cannot be dismissed during pending mutation",()=>{
 for(const name of ["activitySaving","roomSaving","staffSaving"]){
  assert.match(app,new RegExp("if\\(!"+name+"\\) setShow"));
 }
});

test("admin reassignments include old immutable cleaner ID and reload after conflict",()=>{
 assert.match(app,/room\.cleanerId \?\? null : undefined/);
 assert.match(app,/if\(!savingChecklist\)await loadEventsFromSupabase\(\)/);
 assert.match(app,/catch\(error\)[\s\S]*?await loadEventsFromSupabase\(\)/);
});
test("admin assignment dropdown sends immutable cleaner IDs",()=>{
 assert.match(app,/assignedCleanerId:\s*e\.target\.value\s*\?\s*Number\(e\.target\.value\)\s*:\s*null/);
 assert.match(app,/value=\{room\.cleanerId == null \? "" : String\(room\.cleanerId\)\}/);
 assert.match(app,/assignedCleanerId:Number\(newRoomStaff\)/);
 assert.doesNotMatch(app,/value=\{user\.name\}/);
});

test("client rejects cross-tab session identity changes after successful PIN sign-in",()=>{
 assert.match(auth,/session\.user\.id !== userId/);
 assert.match(auth,/throw new Error\("登入帳號已變更/);
 assert.match(auth,/user\.role === "admin" && user\.id === "admin"/);
 assert.match(auth,/user\.role === "cleaner" && \/\^cleaner-\[1-9\]\[0-9\]\*\$\//);
});

test("login UI never accepts wrong active identity and clears stale errors on success",()=>{
 assert.match(app,/!session\.authenticated \|\| session\.user\.id !== selectedUserId/);
 assert.match(app,/setAuthRestoreError\(""\)/);
});

test("expired overview session immediately clears room data and returns to login",()=>{
 assert.match(app,/error instanceof HousekeepingApiError && \(error\.status===401 \|\| error\.status===403\)/);
 assert.match(app,/setActivities\(\[\]\);\s*setSharedCalendarEvents\(\[\]\)/);
 assert.match(app,/setCurrentUser\(null\);\s*setShowLogin\(true\);/);
});
test("session name changes update only the same immutable user identity",()=>{
 assert.match(app,/session\.user\.name !== currentUser\?\.name/);
 assert.match(app,/previous\?\.id === expectedId \? session\.user : previous/);
});

test("print selection persists across floor/building filters and counts whole activity",()=>{
 assert.match(app,/selectedActivity\?\.rooms\.filter\(room =>\s*selectedPrintRoomIds\.includes\(room\.id\)\)/);
 assert.match(app,/setSelectedPrintRoomIds\(prev => Array\.from\(new Set\(\[/);
 assert.match(app,/const selectedRooms = selectedActivity\.rooms\.filter\(room =>/);
 assert.match(app,/將目前篩選的房間加入列印勾選/);
});
test("mobile room editor has fluid columns and print waits for fonts",()=>{
 assert.match(app,/grid-cols-\[24px_minmax\(0,1fr\)_76px\]/);
 assert.match(app,/sm:grid-cols-\[24px_minmax\(0,1fr\)_96px_64px_36px_30px\]/);
 assert.match(app,/document\.fonts\.ready\.then\(\(\) => window\.print\(\)\)/);
});

test("admin room writes cannot overlap and failed occupant edits keep drafts",()=>{
 assert.match(app,/roomAdministrationSaving\.current\.has\(roomId\)/);
 assert.match(app,/roomAdministrationSaving\.current\.add\(roomId\)/);
 assert.match(app,/roomAdministrationSaving\.current\.delete\(roomId\)/);
 assert.match(app,/disabled=\{savingRoomAdministrationIds\.includes\(room\.id\)\}/);
 assert.match(app,/void updateRoomField\(selectedActivity\.id,room\.id,\{occupant:draft\}\)/);
 assert.match(app,/if\(saved\)setOccupantDrafts\(prev=>/);
 assert.match(app,/if\(prev\[room\.id\]!==draft\)return prev/);
});
test("account switch clears previous user drafts, selections and admin filters",()=>{
 assert.match(app,/setActivities\(\[\]\);\s*setStaffUsers\(\[\]\);\s*setSharedCalendarEvents\(\[\]\);\s*setSelectedPrintRoomIds\(\[\]\);\s*setOccupantDrafts\(\{\}\);/);
 assert.match(app,/setOverviewSearch\(""\)/);
 assert.match(app,/setCalendarSheetDate\(""\)/);
});

test("single and batch A4 printing refuse rooms with unsaved occupant edits",()=>{
 assert.match(app,/function roomHasPendingOccupant\(room: Room\)/);
 assert.match(app,/roomAdministrationSaving\.current\.has\(room\.id\)/);
 assert.match(app,/occupantDrafts\[room\.id\] !== room\.occupant/);
 assert.match(app,/function printSingleRoomA4\(room: Room\) \{\s*if\(roomHasPendingOccupant\(room\)\)/);
 assert.match(app,/selectedRooms\.some\(roomHasPendingOccupant\)/);
});

test("concurrent list refreshes ignore stale out-of-order network responses",()=>{
 assert.match(app,/const sequence=\+\+overviewRequestSequence\.current/);
 assert.match(app,/const sequence=\+\+cleanerRequestSequence\.current/);
 assert.match(app,/sequence!==overviewRequestSequence\.current/);
 assert.match(app,/sequence!==cleanerRequestSequence\.current/);
 assert.match(app,/epoch!==dataEpoch\.current/);
});

test("pending room mutations cannot clear new account drafts after logout",()=>{
 assert.match(app,/const mutationEpoch=dataEpoch\.current/);
 assert.match(app,/if\(mutationEpoch!==dataEpoch\.current\)return false/);
 assert.match(app,/return mutationEpoch===dataEpoch\.current/);
 assert.match(app,/if\(mutationEpoch===dataEpoch\.current\)\{/);
});

test("visible dashboard refreshes periodically without polling background tabs",()=>{
 assert.match(app,/if\(document\.visibilityState!=="visible"\)return/);
 assert.match(app,/window\.setInterval\(refresh,currentUser\.role==="cleaner"\?15_000:30_000\)/);
 assert.match(app,/window\.addEventListener\("focus",refresh\)/);
 assert.match(app,/document\.addEventListener\("visibilitychange",onVisible\)/);
 assert.match(app,/window\.clearInterval\(timer\)/);
});


test("integration build uses the QA entry only on allowlisted branches and never in production",()=>{
 const vite=fs.readFileSync(fileURLToPath(new URL("../vite.config.ts",import.meta.url)),"utf8");
 const html=fs.readFileSync(fileURLToPath(new URL("../index.html",import.meta.url)),"utf8");
 assert.match(vite,/ref === 'feature\/remember-login-30d'/);
 assert.match(vite,/ref === 'integration\/full-release-review-20261105'/);
 assert.match(vite,/vercelEnvironment === 'production'/);
 assert.match(vite,/throw new Error\('Protected app entry requires approved production release'\)/);
 assert.match(vite,/releaseReady = process.env.HOUSEKEEPING_RELEASE_READY/);
 assert.match(vite,/ref !== 'main'/);
 assert.match(html,/\/src\/authSandboxMain\.tsx/);
});
