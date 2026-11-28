import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAtomicCloudConfig,PILOT_CLOUD_URL,PRODUCTION_CLOUD_URL} from '../atomicCloudPreview.js';
const pilot={VITE_AIGF_ATOMIC_SYNC_PREVIEW:'1',VITE_AIGF_VPS_CHAT_PILOT:'1',VITE_AIGF_SYNC_PILOT_KEY:'pilot-key'};
const prod={VITE_AIGF_ATOMIC_SYNC_PREVIEW:'1',VITE_AIGF_VPS_CHAT_PILOT:'1',VITE_AIGF_SERVER_GENERATION_V4:'1',VITE_AIGF_ATOMIC_TARGET:'production',VITE_SUPABASE_URL:PRODUCTION_CLOUD_URL,VITE_SUPABASE_PUBLISHABLE_KEY:'prod-key'};
test('legacy remains disabled; existing pilot retains isolated project',()=>{assert.equal(resolveAtomicCloudConfig({}).enabled,false);assert.deepEqual(resolveAtomicCloudConfig(pilot),{enabled:true,target:'pilot',url:PILOT_CLOUD_URL,key:'pilot-key'});});
test('production requires explicit pinned project and production key',()=>{assert.deepEqual(resolveAtomicCloudConfig(prod),{enabled:true,target:'production',url:PRODUCTION_CLOUD_URL,key:'prod-key'});for(const patch of [{VITE_SUPABASE_URL:PILOT_CLOUD_URL},{VITE_AIGF_SYNC_PILOT_KEY:'pilot-key'},{VITE_SUPABASE_PUBLISHABLE_KEY:''},{VITE_AIGF_SERVER_GENERATION_V4:'0'},{VITE_AIGF_VPS_CHAT_PILOT:'0'}])assert.throws(()=>resolveAtomicCloudConfig({...prod,...patch}),/ATOMIC_/);});
