import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, prepareImport } from '../../src/lib/importFile.ts';
const sample=()=>parseImport(JSON.stringify({habits:[{id:'h',name:'Run',user_id:'foreign'}],habit_logs:[{habit_id:'h',day:'2026-10-01',done:true}],goals:[{id:'g',title:'Goal',linked_core_habit_id:'h'}],goal_tasks:[{id:'s',goal_id:'g',text:'Step'}],goal_entries:[{goal_id:'g',day:'2026-10-01',done_task_ids:['s']}],plan_items:[{id:'e',day:'2026-10-01',title:'Plan',linked_goal_id:'g'}],focus_sessions:[{id:'f',minutes:25,linked_event_id:'e'}]}))!.file;
test('import retries use stable IDs, remove ownership fields, preserve all remapped links',async()=>{
  const a=await prepareImport(sample()),b=await prepareImport(sample());assert.deepEqual(a,b);
  assert.equal(a.tables.habits[0].user_id,undefined);assert.equal(a.tables.habit_logs[0].habit_id,a.tables.habits[0].id);
  assert.equal(a.tables.goals[0].linked_core_habit_id,a.tables.habits[0].id);assert.equal(a.tables.focus_sessions[0].linked_event_id,a.tables.plan_items[0].id);
  assert.deepEqual(a.tables.goal_entries[0].done_task_ids,[a.tables.goal_tasks[0].id]);
});
test('invalid row shapes, oversized input, duplicate IDs and broken links fail before writing',async()=>{
  assert.equal(parseImport('{"habits":[null]}'),null);assert.equal(parseImport('{"habits":[],"goals":{}}'),null);assert.equal(parseImport('x'.repeat(10000001)),null);
  const file=sample();file.habits.push({...file.habits[0]});await assert.rejects(prepareImport(file),/Duplicate/);
  const bad=sample();bad.habit_logs[0].habit_id='missing';await assert.rejects(prepareImport(bad),/Broken/);
});
