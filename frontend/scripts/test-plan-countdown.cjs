const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/use-plan-countdown.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function setup(initial=475){
 const slots=[],effects=[],timers=new Map(),windowListeners=new Map(),documentListeners=new Map();
 let cursor=0,now=0,next=0,focused=true,enabled=true,plan={tier:'normal',remaining_seconds:initial};
 const document={visibilityState:'visible',hasFocus:()=>focused,addEventListener:(e,f)=>documentListeners.set(e,f),removeEventListener:(e,f)=>{if(documentListeners.get(e)===f)documentListeners.delete(e);}};
 const window={setInterval(fn){const id=++next;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),addEventListener:(e,f)=>windowListeners.set(e,f),removeEventListener:(e,f)=>{if(windowListeners.get(e)===f)windowListeners.delete(e);}};
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:()=>react,document,window,performance:{now:()=>now},Math});
 function render(){cursor=0;const value=module.exports.usePlanCountdown(plan,enabled);while(effects.length)effects.shift()();return value;}
 const read=()=>{render();return render();};read();
 return{read,timers,advance(ms){now+=ms;for(const fn of timers.values())fn();return read();},focus(value){focused=value;windowListeners.get(value?'focus':'blur')?.();return read();},visible(value){document.visibilityState=value?'visible':'hidden';documentListeners.get('visibilitychange')?.();return read();},status(seconds,tier='normal'){plan={remaining_seconds:seconds,tier};return read();},enabled(value){enabled=value;return read();},unmount(){for(const item of slots)item?.cleanup?.();},listenerCount(){return windowListeners.size+documentListeners.size;}};
}

test('sidebar time decreases every second between ten-second server heartbeats',()=>{
 const h=setup();assert.equal(h.read(),475);assert.equal(h.advance(999),475);assert.equal(h.advance(1),474);assert.equal(h.advance(1000),473);assert.equal(h.advance(8000),465);assert.equal(h.status(465),465);assert.equal(h.advance(1000),464);
});
test('blur and hidden tabs pause the display and focus resumes it',()=>{
 const h=setup(100);h.advance(2000);h.focus(false);assert.equal(h.advance(30000),98);h.focus(true);assert.equal(h.advance(1000),97);h.visible(false);assert.equal(h.advance(15000),97);h.visible(true);assert.equal(h.advance(1000),96);
});
test('timer uses elapsed time rather than interval count and never becomes negative',()=>{
 const h=setup(5);assert.equal(h.advance(3200),2);assert.equal(h.advance(10000),0);assert.equal(h.advance(1000),0);
});
test('leaving chat/voice, VIP and unmount remove ticking listeners',()=>{
 const h=setup(100);h.advance(1000);h.enabled(false);assert.equal(h.timers.size,0);const paused=h.read();assert.equal(h.advance(10000),paused);h.enabled(true);h.status(99,'vip');assert.equal(h.timers.size,0);assert.equal(h.listenerCount(),0);h.status(99);assert.equal(h.timers.size,1);h.unmount();assert.equal(h.timers.size,0);assert.equal(h.listenerCount(),0);
});
test('server correction and next-day reset replace the estimated value',()=>{
 const h=setup(2);h.advance(2000);assert.equal(h.read(),0);assert.equal(h.status(600),600);assert.equal(h.advance(1000),599);assert.equal(h.status(580),580);
});
