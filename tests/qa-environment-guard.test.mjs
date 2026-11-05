import test from "node:test";
import assert from "node:assert/strict";
import {assertQaEnvironment,QA_PROJECT_REF,PRODUCTION_PROJECT_REF} from "../api/_lib/qaGuard.js";

const qaUrl=`https://${QA_PROJECT_REF}.supabase.co`;
test("QA preview can use only the allowlisted test database",()=>{
  assert.equal(assertQaEnvironment({vercelEnv:"preview",supabaseUrl:qaUrl}),true);
});
test("accidental production deployment is blocked even with QA database",()=>{
  assert.throws(()=>assertQaEnvironment({vercelEnv:"production",supabaseUrl:qaUrl}),/requires explicit release readiness/);
});
test("production Supabase endpoint is rejected in preview",()=>{
  assert.throws(()=>assertQaEnvironment({vercelEnv:"preview",supabaseUrl:"https://wrong-project.supabase.co"}),/allowlisted test Supabase/);
});
test("lookalike hosts, path injection and invalid URLs cannot bypass QA database guard",()=>{
  for(const url of [
    `https://${QA_PROJECT_REF}.supabase.co.evil.example`,
    `https://evil.example/${QA_PROJECT_REF}.supabase.co`,
    "not a url",
  ])assert.throws(()=>assertQaEnvironment({vercelEnv:"preview",supabaseUrl:url}));
});

test("production can use only its exact database with an explicit server release flag",()=>{
 const productionUrl=`https://${PRODUCTION_PROJECT_REF}.supabase.co`;
 assert.equal(assertQaEnvironment({vercelEnv:"production",supabaseUrl:productionUrl,releaseReady:"enabled"}),true);
 assert.throws(()=>assertQaEnvironment({vercelEnv:"production",supabaseUrl:qaUrl,releaseReady:"enabled"}),/database mismatch/);
 assert.throws(()=>assertQaEnvironment({vercelEnv:"preview",supabaseUrl:productionUrl,releaseReady:"enabled"}),/forbidden outside production/);
 assert.throws(()=>assertQaEnvironment({vercelEnv:"preview",supabaseUrl:qaUrl,releaseReady:"enabled"}),/forbidden outside production/);
});
test("production credentials cannot accidentally be used in local or preview builds",()=>{
 for(const env of [undefined,"preview","development"]){
   assert.throws(()=>assertQaEnvironment({vercelEnv:env,
    supabaseUrl:`https://${PRODUCTION_PROJECT_REF}.supabase.co`}),/allowlisted test/);
 }
});
