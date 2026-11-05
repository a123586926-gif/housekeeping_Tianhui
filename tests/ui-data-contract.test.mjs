import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";

const app=fs.readFileSync(fileURLToPath(new URL("../src/App.tsx",import.meta.url)),"utf8");
const api=fs.readFileSync(fileURLToPath(new URL("../api/data/rooms.js",import.meta.url)),"utf8");
const auth=fs.readFileSync(fileURLToPath(new URL("../src/lib/authSession.ts",import.meta.url)),"utf8");
const vite=fs.readFileSync(fileURLToPath(new URL("../vite.config.ts",import.meta.url)),"utf8");

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
test("local activity dates and guest printing split at 6 people",()=>{
 assert.match(app,/todayStart\s*=\s*new Date\(today\.getFullYear\(\),\s*today\.getMonth\(\),\s*today\.getDate\(\)\)/);
 assert.match(app,/const useTwoColumns = guests\.length >= 6/);
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
test("PIN editing preserves entered values and exposes persistent outcome when server rejects",()=>{
 const open=app.indexOf("function openEditStaffModal(");
 const save=app.indexOf("async function saveStaffModal(",open);
 const end=app.indexOf("\n  return (",save);
 const body=app.slice(save,end);
 assert.ok(open>=0&&save>open&&end>save);
 assert.match(body,/setStaffSaveStatus\("saving"\)/);
 assert.match(body,/setStaffSaveStatus\("error"\)/);
 assert.match(body,/setStaffFeedback\(\(error instanceof Error/);
 const failure=body.slice(body.indexOf("}catch(error){"),body.indexOf("}finally{"));
 assert.doesNotMatch(failure,/setNewStaffPin\(" "\)|setNewStaffPin\(""\)/);
 assert.match(app,/房務 PIN 修正版 11\/05-K/);
 assert.match(app,/新 PIN 尚未確認儲存/);
 assert.match(app,/尚未輸入新 PIN/);
});
test("all pre-submit PIN rejects show persistent error and live complexity feedback",()=>{
 const begin=app.indexOf("async function saveStaffModal()");
 const end=app.indexOf("\n  return (",begin);
 const handler=app.slice(begin,end);
 const guardErrors=[
  "上一次儲存還在進行","管理員登入狀態已失效","請填寫房務人員姓名",
  "找不到這位房務人員","請輸入新的 8～32 位數字 PIN",
 ];
 for(const message of guardErrors)assert.match(handler,new RegExp("rejectSave\\(\""+message));
 assert.match(handler,/if\(pinValue && validateNewStaffPin\(pinValue\)\)/);
 assert.match(handler,/rejectSave\(validateNewStaffPin\(pinValue\)\)/);
 assert.match(handler,/setStaffSaveStatus\("error"\)/);
 assert.match(app,/validateNewStaffPin\(newStaffPin\.trim\(\)\)/);
 assert.match(app,/PIN 格式符合安全規則，可以點選儲存/);
 assert.match(app,/setStaffButtonPresses\(0\)/);
 assert.doesNotMatch(app,/setNewStaffPin\(e\.target\.value\); setStaffFeedback\(""\); setStaffSaveStatus\("idle"\)/);
 assert.match(app,/if\(!staffMutationBusy\.current\) setNewStaffPin\(e\.target\.value\)/);
});
test("PIN success does not await directory fetching and shows current API stage",()=>{
 const begin=app.indexOf("async function saveStaffModal()");
 const end=app.indexOf("\n  return (",begin);
 const handler=app.slice(begin,end);
 assert.match(handler,/setStaffSaveStage\("等待 PIN 設定 API 回應"\)/);
 assert.match(handler,/setStaffSaveStage\("PIN API 已確認，更新登入名單"\)/);
 assert.match(handler,/void fetch\("\/api\/auth\/accounts"/);
 assert.doesNotMatch(handler,/await fetch\("\/api\/auth\/accounts"/);
 assert.match(app,/目前階段：\{staffSaveStage\}/);
});
test("PIN preflight synchronous errors are caught rather than leaving modal saving",()=>{
 const begin=app.indexOf("async function saveStaffModal()");
 const end=app.indexOf("\n  return (",begin);
 const handler=app.slice(begin,end);
 assert.match(handler,/setStaffSaveStage\("檢查輸入資料"\);[\s\S]*?try\s*\{[\s\S]*?if\(currentUser\?\.role/);
 assert.match(handler,/catch\(error\)[\s\S]*?setStaffSaveStatus\("error"\)/);
 assert.match(handler,/送出前程式錯誤/);
 assert.match(app,/saveStaffModal\(\)\.catch\(\(\)=>\{/);
});
test("production-only UI is keyed to the actual official hostname, not a missing build flag",()=>{
 assert.doesNotMatch(app,/__HOUSEKEEPING_PRODUCTION__/);
 assert.doesNotMatch(app,/import\.meta\.env\.VITE_HK_RELEASE_APPROVED/);
 assert.match(app,/window\.location\.hostname\.toLowerCase\(\) === "housekeeping-tianhui\.vercel\.app"/);
 assert.match(app,/if\(!isApprovedProductionUI\(\) && !name\.startsWith/);
 assert.match(app,/event_name:!isApprovedProductionUI\(\)/);
 assert.match(vite,/vercelEnvironment === 'production' && releaseReady && ref === 'main'/);
});
test("activity sorting puts today and future first, past dates last, and refreshes across midnight",()=>{
 assert.match(app,/function sortActivitiesByClosestDate\(list: Activity\[\], today: Date\)/);
 assert.match(app,/if \(aPast !== bPast\) return aPast \? 1 : -1/);
 assert.match(app,/if \(!aPast && !bPast\) return aDate - bDate/);
 assert.match(app,/return bDate - aDate/);
 assert.match(app,/window\.setInterval\(refreshDate, 60_000\)/);
});
test("activity room search covers room number, assigned cleaner, occupant and resets on activity switch",()=>{
 assert.match(app,/const \[activityRoomSearch,setActivityRoomSearch\] = useState\(" "\)/.source === "no-match" ? /activityRoomSearch/ : /activityRoomSearch/);
 assert.match(app,/const term=activityRoomSearch\.trim\(\)\.toLocaleLowerCase\(\)/);
 assert.match(app,/\[roomLabel\(room\),room\.roomNo,room\.assignedTo,room\.occupant\]/);
 assert.match(app,/setActivityRoomSearch\(" "\)|setActivityRoomSearch\(""\)/);
 assert.match(app,/顯示 \{filteredActivityRooms\.length\} \/ \{selectedActivity\.rooms\.length\} 間房/);
});
test("admin room creation validates room number before invoking service and still checks duplicates",()=>{
 const start=app.indexOf("async function saveNewRoom()");
 const end=app.indexOf("function selectActivity(",start);
 const body=app.slice(start,end);
 assert.match(body,/!\/\^\[A-Z0-9\]\{1,8\}\$\/\.test\(roomNo\)/);
 assert.ok(body.indexOf("^[A-Z0-9]")<body.indexOf("createQaRoom("));
 assert.match(body,/selectedActivity\.rooms\.some/);
 assert.match(body,/roomMutationBusy\.current=true/);
});
test("inline iPhone-safe cleaner picker uses immutable IDs without native select overlay",()=>{
 assert.match(app,/openCleanerPickerRoomId,setOpenCleanerPickerRoomId/);
 assert.match(app,/aria-expanded=\{openCleanerPickerRoomId===room\.id\}/);
 assert.match(app,/role="group"/);
 assert.match(app,/assignedCleanerId=option\.id \? Number\(option\.id\) : null/);
 assert.match(app,/updateRoomField\(selectedActivity\.id,room\.id,\{assignedCleanerId\}\)/);
 assert.match(app,/setOpenCleanerPickerRoomId\(""\)/);
 assert.match(app,/assignedCleanerId:Number\(newRoomStaff\)/);
 assert.doesNotMatch(app,/value=\{room\.cleanerId == null \? "" : String\(room\.cleanerId\)\}/);
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

test("approved A4 preview uses 1.5x bold heading and even single or dual name columns",()=>{
 const start=app.indexOf("function buildA4RoomPage(room: Room)");
 const stop=app.indexOf("function openPrintWindow(",start);
 const print=app.slice(start,stop);
 assert.ok(start>=0 && stop>start);
 assert.match(print,/const useTwoColumns = guests\.length >= 6/);
 assert.match(print,/guests\.length <= 1 \? "single-xl"/);
 assert.match(print,/guests\.length <= 5 \? "single-lg"/);
 assert.match(print,/guests\.length <= 8 \? "double" : "double dense"/);
 assert.match(print,/const printedRoomNo = \(room\.building \+ room\.roomNo\)\.toUpperCase\(\)/);
 assert.match(print,/escapeHtml\(printedRoomNo\)/);
 assert.match(print,/font-size: 69mm/);
 assert.match(print,/font-weight: 900/);
 assert.match(print,/\.guest-grid-one[\s\S]*?justify-content: space-evenly/);
 assert.match(print,/\.guest-col[\s\S]*?justify-content: space-evenly/);
 assert.match(print,/padding: 10mm 0 14mm/);
 assert.match(print,/\.double\.dense \.guest-row/);
 assert.match(print,/overflow-wrap: anywhere/);
 assert.match(print,/page-break-after: always/);
 assert.match(print,/\.a4-page:last-child/);
 assert.match(print,/escapeHtml\(guest\)/);
 assert.match(print,/document\.fonts\.ready/);
});
test("print selection persists across floor/building filters and counts whole activity",()=>{
 assert.match(app,/selectedActivity\?\.rooms\.filter\(room =>\s*selectedPrintRoomIds\.includes\(room\.id\)\)/);
 assert.match(app,/setSelectedPrintRoomIds\(prev => Array\.from\(new Set\(\[/);
 assert.match(app,/const selectedRooms = selectedActivity\.rooms\.filter\(room =>/);
 assert.match(app,/將目前篩選的房間加入列印勾選/);
});
test("mobile dialogs scroll safely on small portrait screens without clipping action buttons",()=>{
 assert.ok((app.match(/max-h-\[calc\(100dvh-2rem\)\]/g)||[]).length>=5);
 assert.equal((app.match(/overflow-y-auto overscroll-contain bg-\[#0F172A\]/g)||[]).length,4);
 assert.match(app,/overflow-y-auto overscroll-contain bg-\[#0f172a\]\/40/);
 assert.match(app,/sm:items-center sm:p-4/);
 assert.match(app,/my-auto box-border w-full max-w-sm min-w-0 max-h-\[calc\(100dvh-2rem\)\]/);
 assert.match(app,/pb-\[calc\(env\(safe-area-inset-bottom\)\+1\.25rem\)\]/);
 assert.match(app,/flex min-w-0 items-center gap-2 text-\[15px\]/);
 assert.match(app,/max-w-md pb-32 md:max-w-3xl/);
});
test("mobile cleaner picker avoids iOS native wheel and keeps larger touch controls",()=>{
 const first=app.indexOf("onClick={()=>setOpenCleanerPickerRoomId(");
 const opts=app.indexOf("選擇打掃人員",first);
 assert.ok(first>0 && opts>first);
 assert.match(app,/grid grid-cols-2 gap-2 sm:grid-cols-3/);
 assert.match(app,/min-h-\[48px\]/);
 assert.match(app,/text-\[15px\] leading-6 text-\[#514837\]/);
 assert.match(app,/min-h-\[46px\] rounded-\[16px\]/);
});
test("mobile room editor has fluid columns and print waits for fonts",()=>{
 assert.match(app,/flex min-w-0 items-center gap-2/);
 assert.match(app,/直接填寫住宿人姓名/);
 assert.match(app,/document\.fonts\.ready\.then\(\(\) => window\.print\(\)\)/);
});

test("admin room writes cannot overlap and failed occupant edits keep drafts",()=>{
 assert.match(app,/roomAdministrationSaving\.current\.has\(roomId\)/);
 assert.match(app,/roomAdministrationSaving\.current\.add\(roomId\)/);
 assert.match(app,/roomAdministrationSaving\.current\.delete\(roomId\)/);
 assert.match(app,/disabled=\{savingRoomAdministrationIds\.includes\(room\.id\)\}/);
 assert.match(app,/void saveOccupantList\(selectedActivity\.id,room\.id,draft\)/);
 assert.match(app,/if\(saved\)setOccupantDrafts\(prev=>/);
 assert.match(app,/splitGuestLines\(prev\[roomId\]\?\?""\)\.join\("、"\)!==normalized/);
});
test("V2.1 new annual overview, quick paste and exact-match duplicate warnings",()=>{
 assert.match(app,/activitySection,setActivitySection/);
 assert.match(app,/activityScope,setActivityScope/);
 assert.match(app,/活動總覽/);
 assert.match(app,/活動總數/);
 assert.match(app,/findDuplicateOccupants\(/);
 assert.match(app,/saveOccupantList\(/);
 assert.match(app,/quickPasteMode==="append"/);
 assert.match(app,/發現重複姓名/);
 assert.match(app,/role="alertdialog"/);
 assert.match(app,/splitGuestLines\(quickPasteText/);
 assert.match(app,/brand-logo\.svg/);
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
