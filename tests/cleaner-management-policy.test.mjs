import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCleanerName,validateCleanerManagementInput} from "../api/_lib/cleanerManagementPolicy.js";

test("ordinary real staff names are valid in planning but cannot be executed as QA mutations",()=>{
 const input={method:"POST",name:" 王阿姨 "};
 assert.equal(normalizeCleanerName(input.name),"王阿姨");
 const planning=validateCleanerManagementInput({...input,mode:"production-planning"});
 assert.deepEqual(planning,{ok:true,action:"create",name:"王阿姨",cleanerId:null,executableInQa:false});
 const qa=validateCleanerManagementInput({...input,mode:"qa"});
 assert.equal(qa.ok,false);
});
test("QA-only names remain accepted, retaining current behavior",()=>{
 const r=validateCleanerManagementInput({method:"POST",name:"【權限驗收】清潔丁"});
 assert.deepEqual(r,{ok:true,action:"create",name:"【權限驗收】清潔丁",cleanerId:null,executableInQa:true});
 assert.equal(validateCleanerManagementInput({method:"POST",name:"【權限驗收】"}).ok,false);
});
test("existing QA rename and disable semantics stay unchanged",()=>{
 const renamed=validateCleanerManagementInput({method:"PATCH",action:"rename",cleanerId:7,name:"【權限驗收】清潔丁"});
 assert.equal(renamed.ok,true);
 assert.equal(renamed.cleanerId,7);
 const disabled=validateCleanerManagementInput({method:"PATCH",action:"disable",cleanerId:7});
 assert.equal(disabled.ok,true);
 assert.equal(disabled.name,"");
});
test("invalid IDs, malformed names, invalid mode or unsupported operations are rejected",()=>{
 for(const id of [-1,0,"2",null])
   assert.equal(validateCleanerManagementInput({method:"PATCH",action:"disable",cleanerId:id}).ok,false);
 for(const name of ["", "  ", "a".repeat(101), "【權限驗收】\nX"])
   assert.equal(validateCleanerManagementInput({method:"POST",name}).ok,false);
 assert.equal(validateCleanerManagementInput({method:"PATCH",action:"create",cleanerId:7,name:"【權限驗收】清潔丁"}).ok,false);
 assert.equal(validateCleanerManagementInput({method:"POST",action:"disable",name:"【權限驗收】清潔丁"}).ok,false);
 assert.equal(validateCleanerManagementInput({method:"POST",name:"【權限驗收】清潔丁",mode:"production"}).ok,false);
});
