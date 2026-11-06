const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/components/workspace.tsx'), 'utf8');
const compiled = ts.transpileModule(source.slice(source.indexOf('function HealingPage()'),source.indexOf('function SettingsPage('))+'\nmodule.exports=HealingPage;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function setup(library = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/lib/healing-library.json"), "utf8"))) {
  const slots=[]; let cursor=0, tree, audioProps;
  let now=0,nextTimer=1;const timers=new Map(),effects=[];
  const audio={paused:true,src:'',volume:1,loop:false,plays:0,pauses:0,play(){this.paused=false;this.plays++;audioProps.onPlay();return Promise.resolve();},pause(){this.paused=true;this.pauses++;audioProps?.onPause();}};
  const jsx=(type,props,key)=>({type,props:{...props,key}});
  const module={exports:{}};
  const ctx={healingLibrary: library,module,exports:module.exports,require:()=>({jsx,jsxs:jsx}),setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j]))){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},api:async()=>[],youtubeId:url=>new URL(url).searchParams.get("v")};
  for(const icon of ['Heart','Clock','Leaf','UserRound','ArrowRight','MoreHorizontal','Play','Pause','Music2','X','ExternalLink','Empty','Notice'])ctx[icon]=icon;
  vm.runInNewContext(compiled,ctx);
  function all(n,p,result=[]) {if(!n||typeof n!=='object')return result;if(p(n))result.push(n);for(const c of [n.props?.children].flat(Infinity))all(c,p,result);return result;}
  function render(){cursor=0;tree=module.exports();const node=all(tree,n=>n.type==='audio')[0];audioProps=node.props;node.props.ref.current=audio;while(effects.length)effects.shift()();return tree;}
  function click(label){render();const b=all(tree,n=>n.type==='button'&&n.props['aria-label']===label)[0];assert.ok(b,label);b.props.onClick();render();}
  render();return{audio,click,render,all,advance(ms){now+=ms;for(const [id,timer] of timers){if(timer.at<=now){timers.delete(id);timer.fn();}}render();},timers};
}
test('ambient playback begins with one click and the same button pauses it',async()=>{
  const h=setup([{id:'rain',title:'Tiếng mưa bình yên',source_type:'audio',url:'/audio/recorded-rain.ogg',builtin:true}]);assert.equal(h.audio.plays,0);h.click('Phát: Tiếng mưa bình yên');assert.equal(h.audio.plays,1);assert.equal(h.audio.src,'/audio/recorded-rain.ogg');assert.equal(h.audio.loop,true);h.click('Tạm dừng: Tiếng mưa bình yên');assert.equal(h.audio.paused,true);
});
test('changing tracks uses the same player and closing stops playback',()=>{
  const h=setup([{id:'rain',title:'Tiếng mưa bình yên',source_type:'audio',url:'/audio/recorded-rain.ogg',builtin:true},{id:'lofi',title:'Lofi học tập',source_type:'audio',url:'/audio/lofi-v2.wav',builtin:true}]);h.click('Phát: Tiếng mưa bình yên');h.click('Phát: Lofi học tập');assert.equal(h.audio.src,'/audio/lofi-v2.wav');assert.equal(h.audio.plays,2);h.click('Đóng trình phát');assert.equal(h.audio.paused,true);
});
test('six built-in audio files have valid PCM headers and nonempty samples',()=>{
  for(const name of ['rain','lofi','ocean','sleep','forest','positive']){const b=fs.readFileSync(path.join(__dirname,'../public/audio',name+'.wav'));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.ok(b.length>100000);assert.equal(b.readUInt16LE(22),1);}
});

test('library has ten unique YouTube videos per category with source attribution',()=>{
 const library=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'));
 assert.equal(library.length,60); const ids=new Set(),counts={};
 for(const t of library){
  assert.equal(t.source_type,'youtube');assert.equal(t.builtin,false);
  assert.match(t.video_id,/^[a-zA-Z0-9_-]{11}$/);
  assert.equal(new URL(t.url).searchParams.get('v'),t.video_id);
  assert.ok(t.channel);assert.ok(t.source_title);assert.ok(t.duration_seconds>120);
  assert.ok(t.rights_note.includes(t.channel)); ids.add(t.video_id);
  counts[t.category]=(counts[t.category]||0)+1;
 }
 assert.equal(ids.size,60);assert.equal(Object.keys(counts).length,6);
 for(const count of Object.values(counts))assert.equal(count,10);
});

test('every track has its own available cover photograph',()=>{
  const library=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'));
  const covers=new Set();
  for(const track of library){assert.ok(fs.existsSync(path.join(__dirname,'../public',track.cover_atlas)));covers.add(track.cover_atlas+'|'+track.cover_position);}
  assert.equal(covers.size,60);
});

test('YouTube starts only after selection, switches video and unmounts on close',()=>{
 const tracks=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'));
 const h=setup();assert.equal(h.all(h.render(),n=>n.type==='iframe').length,0);
 h.click('Phát: '+tracks[0].title);
 let player=h.all(h.render(),n=>n.type==='iframe')[0];
 assert.ok(player.props.src.includes(tracks[0].video_id));assert.ok(player.props.src.includes('autoplay=1'));assert.equal(new URL(player.props.src).searchParams.get('end'),'300');
 assert.equal(h.audio.plays,0);assert.equal(h.audio.paused,true);
 const oldKey=player.props.key; h.click('Phát: '+tracks[0].title);
 player=h.all(h.render(),n=>n.type==='iframe')[0]; assert.notEqual(player.props.key,oldKey);
 h.click('Phát: '+tracks[1].title);
 const players=h.all(h.render(),n=>n.type==='iframe');assert.equal(players.length,1);
 assert.ok(players[0].props.src.includes(tracks[1].video_id));
 assert.ok(h.all(h.render(),n=>n.type==='a'&&n.props.href===tracks[1].url).length);
 h.click('Đóng trình phát');assert.equal(h.all(h.render(),n=>n.type==='iframe').length,0);
});

test('opening YouTube stops a currently playing local audio track',()=>{
 const t=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'))[0];
 const h=setup([{id:'local',title:'Local audio',source_type:'audio',url:'/audio/lofi-v2.wav'},t]);
 h.click('Phát: Local audio'); assert.equal(h.audio.paused,false);
 h.click('Phát: '+t.title);assert.equal(h.audio.paused,true);
 assert.equal(h.all(h.render(),n=>n.type==='iframe').length,1);
});

test('listening stops at five minutes and switching/closing cleans up its timer',()=>{
 const tracks=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'));
 const h=setup();h.click('Phát: '+tracks[0].title);assert.equal(h.timers.size,1);
 h.advance(299000);assert.equal(h.all(h.render(),n=>n.type==='iframe').length,1);
 h.advance(1000);assert.equal(h.all(h.render(),n=>n.type==='iframe').length,0);
 assert.ok(h.all(h.render(),n=>n.props.role==='status').length);
 h.click('Phát: '+tracks[0].title);h.advance(200000);h.click('Phát: '+tracks[1].title);
 assert.equal(h.timers.size,1);h.advance(100000);assert.equal(h.all(h.render(),n=>n.type==='iframe').length,1);
 h.click('Đóng trình phát');assert.equal(h.timers.size,0);
});

test('favorite toggle and shorter timer work without allowing more than five minutes',()=>{
 const track=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/lib/healing-library.json'),'utf8'))[0];
 const h=setup();h.click('Phát: '+track.title);h.click('Lưu yêu thích');
 let favorite=h.all(h.render(),n=>n.type==='button'&&n.props['aria-label']==='Lưu yêu thích')[0];
 assert.equal(favorite.props['aria-pressed'],true);h.click('Lưu yêu thích');
 favorite=h.all(h.render(),n=>n.type==='button'&&n.props['aria-label']==='Lưu yêu thích')[0];assert.equal(favorite.props['aria-pressed'],false);
 let select=h.all(h.render(),n=>n.type==='select')[0];select.props.onChange({target:{value:'10'}});h.render();
 assert.equal(h.all(h.render(),n=>n.type==='select')[0].props.value,5);
 select=h.all(h.render(),n=>n.type==='select')[0];select.props.onChange({target:{value:'1'}});h.render();
 assert.equal(new URL(h.all(h.render(),n=>n.type==='iframe')[0].props.src).searchParams.get('end'),'60');
 h.advance(60000);assert.equal(h.all(h.render(),n=>n.type==='iframe').length,0);
});
