import test from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../../src/data/pagination.ts';
test('loads more than 1000 rows even when the API caps pages below the requested size', async()=>{
  const data=Array.from({length:2307},(_,i)=>i);let calls=0;
  const got=await allRows(async(from,to)=>{calls++;return {data:data.slice(from,Math.min(to+1,from+100)),error:null}});
  assert.deepEqual(got,data);assert.equal(calls,25);
});
test('a later-page failure rejects the whole fetch instead of returning incomplete statistics',async()=>{
  await assert.rejects(allRows(async(from)=>from?{data:null,error:Error('offline')}:{data:[1],error:null}),/offline/);
});
