const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/components/breathing-guide.tsx'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
test('one inhale/exhale cycle closes automatically and cleans up',()=>{
 let value=0,tick,finish,cleanup,shown=false,closed=false,stopped=false,effect;
 const module={exports:{}};const dialog={classList:{add(name){assert.equal(name,"breathing-guide-finishing");}},showModal(){shown=true;},close(){closed=true;}};
 const jsx=(type,props)=>({type,props});
 vm.runInNewContext(code,{module,exports:module.exports,window:{setTimeout(fn,ms){assert.equal(ms,900);finish=fn;return 2;},clearTimeout(){finish=null;},setInterval(fn,ms){assert.equal(ms,1000);tick=fn;return 1;},clearInterval(id){assert.equal(id,1);tick=null;}},require(name){if(name==='react')return {useState:()=>[value,fn=>value=typeof fn==='function'?fn(value):fn],useRef:initial=>({current:initial??dialog}),useEffect(fn,deps){if(deps.length===0&&!effect)effect=fn;}};if(name==='lucide-react')return{Wind:'Wind',X:'X'};return {jsx,jsxs:jsx};}});
 function render(){return module.exports.default({onStop(){stopped=true;}});}
 function find(n,p){if(!n||typeof n!=='object')return null;if(p(n))return n;for(const c of [n.props?.children].flat(Infinity)){const found=find(c,p);if(found)return found;}return null;}
 let tree=render();cleanup=effect();assert.equal(shown,true);
 for(let i=1;i<=5;i++){tree=render();assert.equal(find(tree,n=>n.props?.className==='breathing-guide-count').props.children,i);assert.equal(find(tree,n=>n.type==='h2').props.children,'Hít vào nhẹ nhàng');tick();}
 tree=render();assert.equal(find(tree,n=>n.type==='h2').props.children,'Thở ra chậm…');
 for(let i=0;i<4;i++)tick();assert.equal(stopped,false);tick();assert.equal(stopped,false);assert.equal(closed,false);assert.equal(tick,null);assert.ok(finish);finish();assert.equal(stopped,true);assert.equal(closed,true);
 tree.props.onCancel({preventDefault(){}});assert.equal(stopped,true);
 cleanup();assert.equal(tick,null);assert.equal(closed,true);
});

