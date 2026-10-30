import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const id=()=>crypto.randomUUID();
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const folder=new URL('../../../supabase/migrations/',import.meta.url);
  for(const f of readdirSync(folder).filter(x=>x.endsWith('.sql')).sort()){
    try{await db.exec(readFileSync(new URL(f,folder),'utf8'));}catch(e){throw Error(f+': '+(e as Error).message);}
  }
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)',[A,'a@example.test',B,'b@example.test']);
});
after(async()=>{await db.close()});
async function user(uid:string,fn:()=>Promise<void>){
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  try{await fn()}finally{await db.exec('reset role')}
}
async function apply(ops:unknown[],request=id(),owner=A){await db.query('select public.apply_my_operations($1,$2,$3::jsonb)',[request,owner,JSON.stringify(ops)])}
test('fresh schema migrates, all public tables have RLS, and limits are removed',async()=>{
  const r=await db.query<{relname:string}>("select relname from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");assert.deepEqual(r.rows,[]);
  assert.equal((await db.query('select * from subscriptions')).rows.length,0);
  await user(A,async()=>{for(let i=0;i<8;i++)await apply([{t:'habits',a:'insert',v:{id:id(),name:'Habit '+i,core:true}}]);});
});
test('a failed multi-row import rolls back both rows and receipt; retry succeeds exactly once',async()=>{
  const h=id(),request=id();
  await user(A,async()=>{
    const rows={habits:[{id:h,name:'Imported'}],habit_logs:[{habit_id:h,day:'2026-10-01',value:-1}]};
    await assert.rejects(db.query('select public.import_my_data($1,$2::jsonb,$3)',[request,JSON.stringify(rows),A]));
    assert.equal((await db.query('select id from habits where id=$1',[h])).rows.length,0);
    assert.equal((await db.query('select id from write_receipts where id=$1',[request])).rows.length,0);
    rows.habit_logs[0].value=1;
    for(let i=0;i<2;i++)await db.query('select public.import_my_data($1,$2::jsonb,$3)',[request,JSON.stringify(rows),A]);
    assert.equal((await db.query('select id from habits where id=$1',[h])).rows.length,1);
    assert.equal((await db.query('select * from habit_logs where habit_id=$1',[h])).rows.length,1);
  });
});
test('RLS blocks another account’s reads, writes and forged import ownership',async()=>{
  const h=id();await user(A,async()=>{await apply([{t:'habits',a:'insert',v:{id:h,name:'Private'}}])});
  await user(B,async()=>{
    assert.equal((await db.query('select * from habits where id=$1',[h])).rows.length,0);
    await assert.rejects(apply([{t:'habits',a:'update',v:{name:'Stolen'},eq:{id:h}}],id(),B));
    await assert.rejects(apply([{t:'habit_logs',a:'upsert',v:{habit_id:h,day:'2026-10-01',done:true}}],id(),B));
    await assert.rejects(db.query('select public.import_my_data($1,$2::jsonb,$3)',[id(),'{}',A]));
  });
});
test('batch updates are transactional and duplicate requests do not replay updates',async()=>{
  const h=id(),request=id();await user(A,async()=>{
    await apply([{t:'habits',a:'insert',v:{id:h,name:'Before'}}]);
    await assert.rejects(apply([{t:'habits',a:'update',v:{name:'Partial'},eq:{id:h}},{t:'habits',a:'insert',v:{id:id(),name:''}}]));
    assert.equal((await db.query<{name:string}>('select name from habits where id=$1',[h])).rows[0].name,'Before');
    const ops=[{t:'habits',a:'update',v:{name:'First'},eq:{id:h}}];await apply(ops,request);await apply([{t:'habits',a:'update',v:{name:'Later'},eq:{id:h}}]);await apply(ops,request);
    assert.equal((await db.query<{name:string}>('select name from habits where id=$1',[h])).rows[0].name,'Later');
  });
});
test('the RPC rejects arbitrary tables, SQL identifiers and missing ownership filters',async()=>{
  await user(A,async()=>{
    for(const op of [{t:'subscriptions',a:'upsert',v:{plan:'pro'}},{t:'habits',a:'update',v:{name:'Bad'}},{t:'habits',a:'insert',v:{'name);drop table habits;--':'x'}},{t:'habits',a:'insert',v:{id:id(),name:'Bad',user_id:B}}])await assert.rejects(apply([op]));
  });
});
test('commercial APIs and privileged trigger functions cannot be invoked by clients',async()=>{
  const r=await db.query<{name:string;allowed:boolean}>("select p.proname as name,has_function_privilege('authenticated',p.oid,'execute') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('billing_apply','start_trial','claim_referral','handle_new_user','enforce_free_limits')");
  assert.ok(r.rows.length>=5);assert.ok(r.rows.every(x=>!x.allowed));
});

test('release migration also accepts a schema without billing, referrals or telemetry tables',async()=>{
  const isolated=new PGlite();
  try {
  await isolated.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
    const folder=new URL('../../../supabase/migrations/',import.meta.url);
    for(const f of readdirSync(folder).filter(x=>x.endsWith('.sql') && !/billing|referrals|_events/.test(x)).sort()) {
      await isolated.exec(readFileSync(new URL(f,folder),'utf8'));
    }
    const result=await isolated.query("select to_regprocedure('public.import_my_data(uuid,jsonb,uuid)') as rpc");
    assert.ok(result.rows[0].rpc);
  } finally {await isolated.close();}
});
