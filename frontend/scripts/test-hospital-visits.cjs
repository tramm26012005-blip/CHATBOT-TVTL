const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../student/book-tham-kham.tsx'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(setImmediate);
async function harness(){
 const state=[],effects=[],calls=[];let cursor=0,tree;
 const hospitals=[{id:'h1',name:'Bệnh viện A',address:'Địa chỉ A',phone:'0901234567',departments:[{name:'Tâm lý',doctors:['BS. A']}]},{id:'h2',name:'Bệnh viện B',address:'Địa chỉ B',phone:'0901112223',departments:[{name:'Nội khoa',doctors:['BS. B']}]}];
 const react={useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];},useEffect(fn,deps){const i=cursor++,old=state[i];if(!old||deps.some((d,j)=>d!==old[j])){state[i]=deps;effects.push(fn);}}};
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 const api=async(url,options)=>{calls.push({url,options});if(url==='/hospitals')return hospitals;if(options?.method==='POST')return{id:'visit-1',...JSON.parse(options.body),hospital_name:'Bệnh viện B',status:'pending'};return[];};
 class Data{constructor(form){this.form=form;}get(key){return this.form[key];}}
 vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='@/lib/api')return{api};return{visitStatus:{pending:'Chờ xác nhận từ bệnh viện'},visitTime:v=>v};},AbortController,Date,Intl,FormData:Data,window:{confirm:()=>true}});
 function render(){cursor=0;tree=module.exports.default({user:{id:'student',name:'Sinh viên',email:'student@gmail.com'}});while(effects.length)effects.shift()();}
 function nodes(node,out=[]){if(arguments.length===0)node=tree;if(!node)return out;if(Array.isArray(node)){node.forEach(child=>nodes(child,out));return out;}if(typeof node==='object'){out.push(node);nodes(node.props?.children,out);}return out;}
 function selects(){return nodes().filter(node=>node.type==='select');}
 render();await tick();render();return{render,nodes,selects,calls,text:()=>JSON.stringify(tree)};
}
test('hospital selection clears specialty and doctor from previous hospital',async()=>{
 const h=await harness();h.selects()[0].props.onChange({target:{value:'h1'}});h.render();h.selects()[1].props.onChange({target:{value:'Tâm lý'}});h.render();h.selects()[2].props.onChange({target:{value:'BS. A'}});h.render();assert.equal(h.selects()[2].props.value,'BS. A');
 h.selects()[0].props.onChange({target:{value:'h2'}});h.render();assert.equal(h.selects()[1].props.value,'');assert.equal(h.selects()[2].props.value,'');assert.equal(h.selects()[2].props.disabled,true);assert.doesNotMatch(JSON.stringify(h.selects()),/BS\. A/);
});
test('hospital registration submits a separate pending request with consent and Vietnam time',async()=>{
 const h=await harness();h.selects()[0].props.onChange({target:{value:'h2'}});h.render();h.selects()[1].props.onChange({target:{value:'Nội khoa'}});h.render();
 const form={date:'2099-01-01',time:'09:30',student_name:'Sinh viên',email:'student@gmail.com',phone:'0901234567',school:'Khoa A',description:'Cần hỗ trợ cảm xúc',consent:'on',reset(){}};
 await h.nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){},currentTarget:form});h.render();const request=h.calls.find(call=>call.options?.method==='POST');assert.equal(request.url,'/hospital-visits');const data=JSON.parse(request.options.body);assert.equal(data.starts_at,'2099-01-01T09:30:00+07:00');assert.equal(data.consent,true);assert.equal(data.doctor,null);assert.equal(data.hospital_id,'h2');assert.match(h.text(),/Chờ xác nhận từ bệnh viện/);assert.match(h.text(),/chưa phải phiếu hẹn chính thức/);
});
