/** C94A: scan and decide outer groups first, then surviving nested groups.
 * Every encountered '[' consumes exactly one RND at CS:C9E5. */
export function originalDosPhrase(input:string,random:()=>number):string {
  let text=input;
  for(let iteration=0;iteration<1000;iteration++) {
    const index=text.indexOf('[');
    if(index<0)return text.replaceAll(']','');
    const open=index+1;let cursor=open+1;let depth=1;
    // Match the original 1-based LEN > cursor test, including its handling
    // of a closing bracket at the last character and malformed groups.
    while(text.length>cursor&&depth>0) {
      const char=text[cursor-1];
      if(char==='[')depth++;else if(char===']')depth--;
      cursor++;
    }
    const body=random()<0.5?'':text.slice(open,Math.max(open,cursor-1));
    text=text.slice(0,index)+body+text.slice(cursor-1);
  }
  throw Error('Original phrase expansion limit exceeded');
}
