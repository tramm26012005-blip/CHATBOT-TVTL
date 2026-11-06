const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function context(){const m={exports:{}};let now=0;vm.runInNewContext(compile(fs.readFileSync(path.join(__dirname,'../src/lib/mood-context.ts'),'utf8')),{module:m,exports:m.exports,Date:{now:()=>now},Object});return{...m.exports,advance:ms=>now+=ms};}
test('each selected emotion opens with a relevant question and explicit user context',()=>{
 const c=context();for(const mood of ['Vui vẻ','Bình yên','Bình thường','Hơi buồn','Căng thẳng']){c.setMoodContext('student',mood);const messages=c.takeMoodContext('student');assert.equal(messages.length,2);assert.equal(messages[0].role,'user');assert.ok(messages[0].content.includes(mood));assert.equal(messages[1].role,'assistant');assert.ok(messages[1].content.endsWith('?'));assert.equal(c.takeMoodContext('student'),null);}
});
test('pending mood is short-lived, validated, cleared and never shared with another account',()=>{
 const c=context();c.setMoodContext('a','Căng thẳng');assert.equal(c.takeMoodContext('b'),null);c.setMoodContext('a','Hơi buồn');c.advance(600001);assert.equal(c.takeMoodContext('a'),null);c.setMoodContext('a','Unknown');assert.equal(c.takeMoodContext('a'),null);c.setMoodContext('a','Vui vẻ');c.clearMoodContext();assert.equal(c.takeMoodContext('a'),null);
});
test('first typed chat message includes the selected mood and opening question in API context',async()=>{
 const c=context();c.setMoodContext('a','Căng thẳng');
 const source=fs.readFileSync(path.join(__dirname,'../student/trang-khach-hang.tsx'),'utf8');
 const component=source.slice(source.indexOf('function ChatPage('),source.indexOf('function VoicePage('));
 const slots=[],effects=[];let cursor=0,sent=null;
 const jsx=(type,props)=>({type,props});const m={exports:{}};
 const ctx={module:m,exports:m.exports,require:()=>({jsx,jsxs:jsx}),...c,takeAssessmentContext:()=>null,location:{search:''},history:{replaceState(){}},AbortController,URLSearchParams,api:async()=>({}),chatStream:async(messages)=>{sent=messages;},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 for(const match of component.matchAll(/<([A-Z][A-Za-z0-9_]*)/g))if(!(match[1] in ctx))ctx[match[1]]=match[1];
 vm.runInNewContext(compile(component+'\nmodule.exports=ChatPage;'),ctx);
 const user={id:'a',name:'Sinh viên',role:'student',membership_tier:'normal',settings:{save_history:false}};
 function render(){cursor=0;const tree=m.exports({user,onSupport(){}});while(effects.length)effects.shift()();return tree;}
 function all(n,p,result=[]){if(!n||typeof n!=='object')return result;if(p(n))result.push(n);for(const child of [n.props?.children].flat(Infinity))all(child,p,result);return result;}
 render();let tree=render();assert.ok(all(tree,n=>n.type==='p'&&typeof n.props.children==='string'&&n.props.children.includes('áp lực')).length);
 assert.equal(sent,null);all(tree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Mình sắp thi cuối kỳ'}});tree=render();await all(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(sent.length,3);assert.ok(sent[0].content.includes('Căng thẳng'));assert.ok(sent[1].content.includes('áp lực'));assert.equal(sent[2].content,'Mình sắp thi cuối kỳ');
});


