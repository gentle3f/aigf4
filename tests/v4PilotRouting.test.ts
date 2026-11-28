import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectV4PilotModel,selectVpsModel} from '../vpsChatMode.js';
test('explicit V4 pilot routes supported primary independent of legacy fallback',()=>{
 for(const model of ['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']){
  assert.equal(selectV4PilotModel(model),model);assert.equal(selectVpsModel(true,model,true),null);
 }
 assert.equal(selectV4PilotModel('unsupported'),null);
});
test('actual send path does not silently fall back when V4 is required',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(s,/const dispatchModel=assistantBackground\?selectedAssistantModel:serverRequired\?selectV4PilotModel\(chatModelSettings.primary\):selectedVpsChatModel\(\)/);
 assert.match(s,/if\(serverRequired&&!dispatchModel\)/);
 assert.match(s,/const vpsModel = userContent.vpsServerGeneration \? dispatchModel/);
 assert.match(s,/if\(request.serverGeneration&&!request.vpsTurn\)/);
 assert.match(s,/request.serverGeneration \? 'V4：準備背景生成任務…'/);
});

test('assistant background route keeps unsupported modes on existing route',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(s,/const assistantBackground=!ATOMIC_CLOUD_PRODUCTION&&SERVER_ASSISTANT_GENERATION_V4&&assistantMode.*assistantTextOnlyAttachments.*isAssistantBackgroundModel\(selectedAssistantModel\).*isVeniceAssistantWebSearchEnabled\(\)/);
 assert.match(s,/if\(assistantMode&&request.serverGeneration\)/);
 assert.match(s,/if \(request.serverGeneration \|\| request.vpsTurn \|\| isAbortError\(error\)\)/);
});

test('production uses original direct response route without cloud admission while preserving pilot and existing recovery',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(s,/const serverRequired=assistantBackground\|\|!ATOMIC_CLOUD_PRODUCTION&&SERVER_GENERATION_V4/);
 assert.match(s,/const assistantBackground=!ATOMIC_CLOUD_PRODUCTION&&SERVER_ASSISTANT_GENERATION_V4/);
 assert.match(s,/selectVpsModel\(VPS_CHAT_BUILD,chatModelSettings.primary,\(ATOMIC_CLOUD_PRODUCTION&&currentConversationKey!==NATIVE_SYNC_KEY\)\|\|/);
 assert.match(s,/if\(serverEligible\)\{\s*if\(!supabaseCloudSyncManager/);
 assert.match(s,/request.serverGeneration=userContent.vpsServerGeneration/);
 assert.match(s,/await getResponse\(request, userMessage,/);
 assert.match(s,/if \(VPS_CHAT_BUILD&&!ATOMIC_CLOUD_PREVIEW\) return;\s*const manager = await loadSupabaseCloudSyncManager/);
 assert.match(s,/if\(serverMarker\)/);
});
