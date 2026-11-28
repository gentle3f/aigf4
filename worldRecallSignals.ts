/** Local contextual ranking shared by world state and source-linked memory.
 * No model calls, no mutations, no access outside the selected history.
 */
export const recallNormalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase();
const stop=new Set(['可以','如果','這個','這樣','自己','現在','之後','然後','我們','你們','他們','什麼','如何','一個','沒有','已經','只是','目前','請問','的是','不是','以及','因為','所以','the','and','with','from','that','this','have']);
export const recallTokens=(s:string):Set<string>=>{
 const out=new Set<string>(),n=recallNormalize(s);
 for(const w of n.match(/[a-z0-9][a-z0-9_-]{1,40}/gu)||[])if(!stop.has(w))out.add(w);
 for(const span of n.match(/[\p{Script=Han}]{2,}/gu)||[]){
  const chars=Array.from(span);
  for(let i=0;i+1<chars.length;i++){const t=chars[i]+chars[i+1];if(!stop.has(t))out.add(t);}
 }
 return out;
};
type Source={role:string;content:{text?:string}};
export function recentRecallContext(history:readonly Source[],query:string){
 const rows=history.filter(r=>r.role!=='system'&&r.content.text?.trim());
 const tail=rows.at(-1);
 const end=tail?.role==='user'&&tail.content.text?.trim()===query.trim()?rows.length-1:rows.length;
 return rows.slice(Math.max(0,end-4),end).map(r=>r.content.text!.slice(-1600)).join('\n');
}
export function buildRecallSignals(query:string,recent:string,documents:readonly string[]){
 const q=recallTokens(query),context=recallTokens(recent),frequency=new Map<string,number>();
 const interested=new Set([...q,...context]);
 for(const doc of documents)for(const t of recallTokens(doc))if(interested.has(t))frequency.set(t,(frequency.get(t)||0)+1);
 const total=Math.max(1,documents.length);
 const weight=(t:string)=>Math.min(3,Math.log(1+total/(1+(frequency.get(t)||0))));
 const rank=(value:string)=>{
  let direct=0,background=0;
  for(const t of recallTokens(value)){if(q.has(t))direct+=weight(t);else if(context.has(t))background+=weight(t);}
  return Math.min(24,direct)*5+Math.min(24,background)*1.7;
 };
 return {rank,query:recallNormalize(query),recent:recallNormalize(recent)};
}
