import test from "node:test";
import assert from "node:assert/strict";
import {assertQaEnvironment,QA_PROJECT_REF} from "../api/_lib/qaGuard.js";

const qaUrl=`https://${QA_PROJECT_REF}.supabase.co`;
test("QA preview can use only the allowlisted test database",()=>{
  assert.equal(assertQaEnvironment({vercelEnv:"preview",supabaseUrl:qaUrl}),true);
});
test("accidental production deployment is blocked even with QA database",()=>{
  assert.throws(()=>assertQaEnvironment({vercelEnv:"production",supabaseUrl:qaUrl}),/cannot run in Vercel Production/);
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
