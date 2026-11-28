// Lossless JSON state patch; the full intended snapshot remains in the durable journal.
export type StatePatchEdit={path:string[];value:unknown}|{path:string[];remove:true};
export type StatePatch={version:1;edits:StatePatchEdit[]};
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a:unknown,b:unknown)=>a===b;
export function makeStatePatch(base:object,next:object):StatePatch|null{
 const before=JSON.parse(JSON.stringify(base)),after=JSON.parse(JSON.stringify(next));
 const edits:StatePatchEdit[]=[];
 function walk(a:unknown,b:unknown,path:string[]){
  if(equal(a,b))return;
  if(path.length<16&&object(a)&&object(b)){
   for(const k of Object.keys(a))if(!Object.hasOwn(b,k))edits.push({path:[...path,k],remove:true});
   for(const k of Object.keys(b))if(Object.hasOwn(a,k))walk(a[k],b[k],[...path,k]);else edits.push({path:[...path,k],value:b[k]});
   return;
  }
  if(path.length<16&&Array.isArray(a)&&Array.isArray(b)&&a.length===b.length){
   for(let i=0;i<b.length;i++)walk(a[i],b[i],[...path,String(i)]);
   return;
  }
  edits.push({path,value:b});
 }
 walk(before,after,[]);
 const patch:StatePatch={version:1,edits};
 if(!isStatePatch(patch))return null;
 const size=JSON.stringify(patch).length;
 return size<JSON.stringify(after).length?patch:null;
}
export function isStatePatch(x:unknown):x is StatePatch{
 if(!object(x)||x.version!==1||!Array.isArray(x.edits)||x.edits.length>4096)return false;
 return x.edits.every(e=>object(e)&&Array.isArray(e.path)&&e.path.length>=1&&e.path.length<=16&&e.path.every(k=>typeof k==='string'&&k.length<=1024)&&((Object.hasOwn(e,'value')&&Object.keys(e).length===2)||(e.remove===true&&Object.keys(e).length===2)));
}
