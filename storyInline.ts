/** Display-only inline emphasis for fictional chat. Never interpret model HTML.
 * Leave mathematical asterisks and unmatched markers untouched.
 */
export type StoryInline={kind:'text'|'strong'|'em'|'code';text:string};
export function tokenizeStoryInline(input:string):StoryInline[]{
    const result:StoryInline[]=[];
    const pattern=/(`[^\n`]+`|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|(?<![\w*])\*(?![\s*])[^*\n]*?[^\s*]\*(?![\w*])|(?<![\w*])\*[^\s*]\*(?![\w*]))/gu;
    let cursor=0;
    for(const match of input.matchAll(pattern)){
        const start=match.index??0,token=match[0];
        if(start>cursor)result.push({kind:'text',text:input.slice(cursor,start)});
        const n=token.startsWith('***')?3:token.startsWith('**')?2:1;
        result.push({kind:token[0]==='`'?'code':n>=2?'strong':'em',text:token.slice(n,-n)});
        cursor=start+token.length;
    }
    if(cursor<input.length)result.push({kind:'text',text:input.slice(cursor)});
    return result;
}
export const appendStoryInline=(element:HTMLElement,text:string)=>{
    for(const token of tokenizeStoryInline(text)){
        if(token.kind==='text'){element.appendChild(document.createTextNode(token.text));continue;}
        const span=document.createElement(token.kind);
        span.textContent=token.text;
        element.appendChild(span);
    }
};
