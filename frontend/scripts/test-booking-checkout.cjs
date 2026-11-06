const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../student/dat-lich-chuyen-gia.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness({fail=false}={}) {
 const state=[],calls=[]; let cursor=0,tree;
 const react={useRef(value){const i=cursor++;return state[i]??(state[i]={current:value});},useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(){}};
 const jsx=(type,props)=>({type,props});
 const module={exports:{}};
 const api=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(fail)throw Error('Chưa kết nối được');return {id:'test-booking',starts_at:JSON.parse(options.body).starts_at,payment:{amount:300000},expert_contact:{phone:'0901234567'}};};
 vm.runInNewContext(compiled,{module,exports:module.exports,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='@/lib/api')return{api};if(name.includes('khung-gio-ranh'))return{default:'availability-picker'};if(name.includes('danh-gia'))return{expertDisplayName:n=>n};if(name==='next/link')return{default:'a'};return{X:'svg'};},Intl,Date});
 function render(){cursor=0;tree=module.exports.default({expert:{id:'expert-1',name:'Chuyên gia',fee:300000},user:{name:'Sinh viên',email:'student@gmail.com'},close(){}});return tree;}
 function nodes(node,out=[]){if(arguments.length===0)node=tree;if(!node)return out;if(Array.isArray(node)){node.forEach(x=>nodes(x,out));return out;}if(typeof node==='object'){out.push(node);nodes(node.props?.children,out);}return out;}
 const text=()=>JSON.stringify(tree);
 const button=label=>nodes().find(n=>n.type==='button'&&n.props.children===label);
 function details(){let inputs=nodes().filter(n=>n.type==='input');inputs[2].props.onChange({target:{value:'0901234567'}});nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Áp lực học tập'}});inputs.find(n=>n.props.type==='date').props.onChange({target:{value:'2099-01-02'}});inputs.filter(n=>n.props.type==='checkbox').forEach(n=>n.props.onChange({target:{checked:true}}));render();const picker=nodes().find(n=>n.type==='availability-picker');picker.props.onChange('08:00');picker.props.onReady(true);render();nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();}
 render();return{render,nodes,text,button,calls,details};
}
test('booking stays local until payment confirmation and sends exact consent and fee',async()=>{
 const h=harness();h.details();assert.equal(h.calls.length,0);assert.match(h.text(),/Áp lực học tập/);assert.match(h.text(),/Thanh toán mô phỏng/);
 assert.equal(h.button('Xác nhận mô phỏng và đăng ký').props.disabled,true);
 h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
 const submit=h.button('Xác nhận mô phỏng và đăng ký').props.onClick;await Promise.all([submit(),submit()]);h.render();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.expected_fee,300000);assert.equal(h.calls[0].body.description,'Áp lực học tập');assert.equal(h.calls[0].body.consent_details,true);assert.equal(h.calls[0].body.demo_payment_confirmed,true);assert.match(h.text(),/0901234567/);assert.match(h.text(),/chờ chuyên gia xác nhận/);
});
test('payment back button keeps entered details and a failed request does not complete registration',async()=>{
 const h=harness({fail:true});h.details();h.button('Chỉnh thông tin').props.onClick();h.render();assert.equal(h.nodes().find(n=>n.type==='textarea').props.value,'Áp lực học tập');h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();await h.button('Xác nhận mô phỏng và đăng ký').props.onClick();h.render();assert.match(h.text(),/Chưa kết nối được/);assert.doesNotMatch(h.text(),/Đã gửi đăng ký tư vấn/);
});
