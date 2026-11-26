import type {ChatRoom,RoomSceneState} from './roomManager.js';
import type {ChatMessage,Content} from './managers.js';
import type {TurnReceipt} from './durableChatTurn.js';
import {canonicalContextJson,hashContextJson,type ContextDigestVersion} from './contextFingerprint.js';
export type GroupSceneCommit={jobId:string;roomDigest:string;scene:RoomSceneState};
// Avatar blobs and volatile display timestamps do not change the generation context.
export function groupContextSnapshot(room:ChatRoom):string{
 return JSON.stringify({...room,updatedAt:undefined,members:room.members.map(m=>({...m,persona:{...m.persona,avatarUrl:undefined}}))});
}
export async function digestGroupContext(room:ChatRoom,version:ContextDigestVersion=1):Promise<string>{
 const raw=groupContextSnapshot(room);
 return hashContextJson(version===2?canonicalContextJson(JSON.parse(raw)):raw);
}
export function createGroupCommit(deps:{
 readRoom:(id:string)=>ChatRoom|undefined;
 readHistory:(id:string)=>readonly ChatMessage[];
 writeReply:(r:TurnReceipt,content:Content)=>void;
 confirmReply:(r:TurnReceipt)=>void;
 confirmScene:(id:string,jobId:string)=>boolean;
 writeScene:(id:string,jobId:string,expected:string,scene:RoomSceneState)=>void;
}){
 async function verifyRoom(r:TurnReceipt){
   const room=deps.readRoom(r.conversationKey);
   if(!room||!r.roomDigest||await digestGroupContext(room,r.contextDigestVersion)!==r.roomDigest)throw Error('GROUP_CONTEXT_CHANGED');
   const snapshot=groupContextSnapshot(room);
   if(deps.readRoom(r.conversationKey)!==room||await digestGroupContext(room,r.contextDigestVersion)!==r.roomDigest||groupContextSnapshot(room)!==snapshot)throw Error('GROUP_CONTEXT_CHANGED');
   return snapshot;
 }
 return {
  verifyRoom,
  async persistReply(r:TurnReceipt,content:Content,scene:RoomSceneState){
   await verifyRoom(r);
   // Scene recovery data is durable in the same write as the reply.
   deps.writeReply(r,{...content,vpsGroupSceneCommit:{jobId:r.jobId,roomDigest:r.roomDigest!,scene:structuredClone(scene)}});
  },
  async confirm(r:TurnReceipt){
   deps.confirmReply(r);
   const marker=deps.readHistory(r.conversationKey).find(m=>m.id===r.replyId&&m.role==='model')?.content.vpsGroupSceneCommit;
   if(!marker||marker.jobId!==r.jobId||marker.roomDigest!==r.roomDigest)throw Error('GROUP_SCENE_RECEIPT_MISSING');
   if(deps.confirmScene(r.conversationKey,r.jobId))return;
   const expected=await verifyRoom(r);
   deps.writeScene(r.conversationKey,r.jobId,expected,marker.scene);
   if(!deps.confirmScene(r.conversationKey,r.jobId))throw Error('GROUP_SCENE_NOT_DURABLE');
  },
 };
}
