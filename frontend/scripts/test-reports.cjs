const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../admin/doanh-thu-bao-cao.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(from='',to=''){
  const states=[from,to],csv=[];let cursor=0,blob,download;
  const module={exports:{}};
  const lib={adminMoney:n=>`${n.toLocaleString('vi-VN')}đ`,exportAdminCsv:(name,rows)=>csv.push({name,rows})};
  vm.runInNewContext(compiled,{module,exports:module.exports,require(name){if(name==='react')return{useState:()=>[states[cursor++],()=>{}]};if(name==='@/lib/admin-center')return lib;if(name.endsWith('.css'))return{};return require(name);},Date,Blob,URL:{createObjectURL(value){blob=value;return'blob:test';},revokeObjectURL(){}},document:{createElement(){return{set download(v){download=v;},click(){}};}},setTimeout(){}});
  const data={finance:{total:999999,vip:300000,consultation:240000,refunded:0,months:[{month:'2026-09',vip:100000,consultation:20000},{month:'2026-10',vip:200000,consultation:40000}]}};
  const tree=module.exports.default({data,error:'',reload(){}}),buttons=[];
  function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if(node.type==='button')buttons.push(node);walk(node.props?.children);}walk(tree);
  return{button:text=>buttons.find(b=>b.props.children===text),csv,html:()=>blob.text(),download:()=>download};
}
test('downloaded report uses selected-period admin revenue, not lifetime or expert income',async()=>{
  const h=harness();h.button('Tải báo cáo').props.onClick();const html=await h.html();
  assert.match(html,/360\.000đ/);assert.match(html,/60\.000đ/);assert.match(html,/300\.000đ/);
  assert.doesNotMatch(html,/999\.999đ/);assert.doesNotMatch(html.match(/<div class="summary">(.*?)<\/div>/s)[1],/240\.000đ/);assert.match(html,/2026-09 đến 2026-10/);assert.match(html,/window\.print/);assert.match(h.download(),/\.html$/);
});
test('CSV export applies the requested period and labels the commission correctly',()=>{
  const h=harness('2026-10','2026-10');h.button('Xuất CSV theo kỳ').props.onClick();
  assert.equal(h.csv[0].rows.length,2);assert.equal(h.csv[0].rows[1][0],'2026-10');assert.equal(h.csv[0].rows[1][3],240000);assert.match(h.csv[0].rows[0][2],/20%/);
});
test('invalid or empty export periods disable both download actions',()=>{
  for(const range of [['2026-10','2026-09'],['2027-01','2027-02']]){const h=harness(...range);assert.equal(h.button('Tải báo cáo').props.disabled,true);assert.equal(h.button('Xuất CSV theo kỳ').props.disabled,true);}
});
