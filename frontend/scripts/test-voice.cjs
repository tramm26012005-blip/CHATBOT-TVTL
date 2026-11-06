const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../student/trang-khach-hang.tsx'), 'utf8');
const component = source.slice(source.indexOf('function LiveVoicePage('), source.indexOf('type AssessmentResult'));
const compiled = ts.transpileModule(component + '\nmodule.exports = LiveVoicePage;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const tick = () => new Promise(setImmediate);
function harness(options = {}) {
  const slots = []; let cursor = 0; let tree; let getMediaCalls = 0;
  const records = [], players = [], requests = [];
  const track = { stopped: false, stop() { this.stopped = true; } };
  const media = { getTracks: () => [track] };
  const jsx = (type, props) => ({ type, props });
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm;codecs=opus'; records.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio']) }); this.onstop?.(); }
  }
  class Player {
    constructor() { players.push(this); }
    async play() { if (options.playbackError) throw new Error("Playback blocked"); this.onplaying?.(); }
    pause() { this.onpause?.(); }
  }
  const context = {
    module: { exports: {} }, require: () => ({ jsx, jsxs: jsx }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect() {}, navigator: { mediaDevices: { getUserMedia: () => { getMediaCalls++; return options.mediaPromise || Promise.resolve(media); } } },
    MediaRecorder: Recorder, Audio: Player, AbortController, Blob, FormData, Error,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    api: async (path, request) => { requests.push({ path, request }); if (options.transcribeError) throw new Error('Hết tín dụng'); return { text: 'Mình thấy vui' }; },
    chatStream: async (_, __, ___, signal, callback) => { callback({ delta: 'Mình đang lắng nghe bạn.' }); },
    fetch: async () => ({ ok: !options.ttsError, json: async () => ({ detail: 'Không tạo được giọng nói' }), blob: async () => new Blob(['sound']) }),
    Image: class {},
  };
  for (const icon of ['AudioLines','Menu','MessageCircle','LockKeyhole','Square','Mic','MicOff','LoaderCircle','Phone','Settings','Headphones']) context[icon] = icon;
  context.Link = 'a'; context.Notice = 'notice'; context.Empty = 'empty'; context.RequireLogin = 'login';
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context);
  function render() { cursor = 0; tree = context.module.exports({ user: { settings: {} }, onSupport() {} }); return tree; }
  function all(node, predicate, found = []) { if (!node || typeof node !== 'object') return found; if (predicate(node)) found.push(node); for (const child of [node.props?.children].flat(Infinity)) all(child, predicate, found); return found; }
  function button(label) { render(); const node = all(tree, n => n.type === 'button' && n.props['aria-label'] === label)[0]; assert.ok(node, label); return node; }
  return { render, button, records, players, requests, track, media, getMediaCalls: () => getMediaCalls, text: () => JSON.stringify(render()) };
}
test('voice records, transcribes, replies, plays and returns to ready state', async () => {
  const h = harness();
  await h.button('Bật micro').props.onClick(); await tick();
  assert.match(h.text(), /Mình đang nghe bạn/);
  h.button('Tắt micro và gửi').props.onClick(); await tick(); await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].request.body.get('file').name, 'recording.webm');
  assert.equal(h.players.length, 1); assert.equal(h.track.stopped, true);
  h.players[0].onended();
  assert.match(h.text(), /Đến lượt bạn/);
});
test('ending during a pending microphone permission releases the late stream', async () => {
  let resolve; const h = harness({ mediaPromise: new Promise(r => { resolve = r; }) });
  h.button('Bật micro').props.onClick();
  h.button('Kết thúc cuộc gọi').props.onClick(); resolve(h.media); await tick();
  assert.equal(h.records.length, 0); assert.equal(h.track.stopped, true);
  assert.match(h.text(), /Cuộc trò chuyện đã kết thúc/);
});
test('double clicking the microphone requests permission only once', async () => {
  let resolve; const h = harness({ mediaPromise: new Promise(r => { resolve = r; }) });
  const click = h.button('Bật micro').props.onClick; click(); click();
  assert.equal(h.getMediaCalls(), 1); resolve(h.media); await tick();
  h.button('Kết thúc cuộc gọi').props.onClick();
});
test('transcription failure restores the microphone and exposes an error', async () => {
  const h = harness({ transcribeError: true });
  h.button('Bật micro').props.onClick(); await tick(); h.button('Tắt micro và gửi').props.onClick(); await tick();
  assert.match(h.text(), /Hết tín dụng/); assert.equal(h.button('Bật micro').props.disabled, false);
  assert.equal(h.players.length, 0);
});
test('TTS failure preserves the reply without opening the transcript', async () => {
  const h = harness({ ttsError: true });
  h.button('Bật micro').props.onClick(); await tick(); h.button('Tắt micro và gửi').props.onClick(); await tick(); await tick();
  assert.match(h.text(), /Mình đang lắng nghe bạn/); assert.match(h.text(), /Không tạo được giọng nói/);
  assert.match(h.text(), /"hidden":true/); assert.equal(h.players.length, 0);
});




test('denied microphone permission has a clear message and can be retried', async () => {
  const error = new Error('denied'); error.name = 'NotAllowedError';
  const h = harness({ mediaPromise: Promise.reject(error) });
  h.button('Bật micro').props.onClick(); await tick();
  assert.match(h.text(), /chưa cho phép dùng micro/);
  assert.equal(h.button('Bật micro').props.disabled, false);
  assert.equal(h.records.length, 0);
});
test('browser playback rejection preserves the reply and re-enables microphone', async () => {
  const h = harness({ playbackError: true });
  h.button('Bật micro').props.onClick(); await tick(); h.button('Tắt micro và gửi').props.onClick(); await tick(); await tick();
  assert.match(h.text(), /Playback blocked/); assert.match(h.text(), /"hidden":true/);
  assert.equal(h.button('Bật micro').props.disabled, false);
});
test('ending during recording releases microphone without sending audio', async () => {
  const h = harness();
  h.button('Bật micro').props.onClick(); await tick(); h.button('Kết thúc cuộc gọi').props.onClick(); await tick();
  assert.equal(h.track.stopped, true); assert.equal(h.requests.length, 0);
  assert.equal(h.records[0].state, 'inactive');
});
