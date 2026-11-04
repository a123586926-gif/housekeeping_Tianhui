import test from "node:test";
import assert from "node:assert/strict";
import {pinIsStrong} from "../api/_lib/pinPolicy.js";

test("new PIN accepts varied numeric strings within 8 to 32 digits",()=>{
 for (const pin of ["82930146","60719382","12340295","9081726354"])
   assert.equal(pinIsStrong(pin),true);
});
test("new PIN rejects weak, repetitive, ascending, and descending strings",()=>{
 for (const pin of ["","1234","1234567","12345678","23456789","90123456",
   "87654321","10987654","00000000","11111111","12121212","12341234",
   "99999999","123456789012345678901234567890123","1234abcd"," 82930146 ",
   82930146,null,undefined])
   assert.equal(pinIsStrong(pin),false,String(pin));
});
