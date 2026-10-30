import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment,PRODUCTION_PROJECT_REF } from '../../src/lib/environment.ts';
const credentials={VITE_SUPABASE_URL:`https://${PRODUCTION_PROJECT_REF}.supabase.co`,VITE_SUPABASE_ANON_KEY:'public-test-key'};
test('staging rejects production credentials, missing declarations and disguised custom URLs',()=>{
 for(const e of [{...credentials,VITE_APP_ENV:'staging'},{...credentials,VITE_APP_ENV:'staging',VITE_STAGING_SUPABASE_REF:PRODUCTION_PROJECT_REF},{...credentials,VITE_APP_ENV:'staging',VITE_STAGING_SUPABASE_REF:'another'},{...credentials,VITE_APP_ENV:'local'}])assert.throws(()=>validateEnvironment(e));
 assert.doesNotThrow(()=>validateEnvironment({...credentials,VITE_APP_ENV:'staging',VITE_STAGING_SUPABASE_REF:'isolated',VITE_SUPABASE_URL:'https://isolated.supabase.co'}));
});
test('production cannot silently become a demo, and demo cannot use live credentials',()=>{
 assert.throws(()=>validateEnvironment({}));assert.throws(()=>validateEnvironment({...credentials,VITE_DEMO:'1'}));assert.doesNotThrow(()=>validateEnvironment({VITE_DEMO:'1'}));assert.doesNotThrow(()=>validateEnvironment(credentials));
});
