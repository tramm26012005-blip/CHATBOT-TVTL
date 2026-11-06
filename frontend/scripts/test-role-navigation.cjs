const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/role-navigation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const moduleValue={exports:{}};vm.runInNewContext(code,{module:moduleValue,exports:moduleValue.exports});const {roleDestination}=moduleValue.exports;
test('student appointments and expert directory never lead into expert workspace',()=>{
 assert.equal(roleDestination('student','/bookings'),null);assert.equal(roleDestination('student','/experts'),null);assert.equal(roleDestination('student','/expert'),'/bookings');assert.equal(roleDestination('student','/expert/notes'),'/bookings');assert.equal(roleDestination('student','/admin'),'/');
});
test('staff stay in their own workspace and cannot fall through to customer pages',()=>{
 assert.equal(roleDestination('expert','/'),'/expert');assert.equal(roleDestination('expert','/bookings'),'/expert');assert.equal(roleDestination('expert','/admin'),'/expert');assert.equal(roleDestination('expert','/expert'),null);
 assert.equal(roleDestination('admin','/'),'/admin');assert.equal(roleDestination('admin','/expert'),'/admin');assert.equal(roleDestination('admin','/admin'),null);
});
test('public login and privacy remain available, unknown roles do not gain access',()=>{
 assert.equal(roleDestination(undefined,'/'),null);assert.equal(roleDestination('expert','/login'),null);assert.equal(roleDestination('admin','/privacy'),null);assert.equal(roleDestination('invalid','/bookings'),'/login');
});
