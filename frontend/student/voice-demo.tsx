"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

export default function VoiceDemo({ onSupport }: { onSupport: () => void }) {
  const [listening, setListening] = useState(false), [speaking, setSpeaking] = useState(false);
  const [show, setShow] = useState(false), [text, setText] = useState(""), [error, setError] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [frame, setFrame] = useState(0);
  const recognition = useRef<Recognition | null>(null), generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onend = null; current.onresult = null; current.onerror = null; current.abort(); }
    window.speechSynthesis?.cancel(); setListening(false); setSpeaking(false);
  }
  useEffect(() => () => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); }
    window.speechSynthesis?.cancel();
  }, []);
  useEffect(() => {
    if (!speaking) { setFrame(0); return; }
    const id = setInterval(() => setFrame(value => (value + 1) % 4), 180);
    return () => clearInterval(id);
  }, [speaking]);
  function reply(input: string) {
    const value = input.trim(); if (!value) return;
    stop(); setError(""); const turn = generation.current;
    const risk = /tự tử|tự sát|tự làm hại|không muốn sống/i.test(value);
    const answer = risk ? "Mình muốn ưu tiên sự an toàn của bạn. Bạn có đang gặp nguy hiểm ngay lúc này không? Hãy ở cạnh một người bạn tin tưởng và tìm hỗ trợ từ nhân viên y tế. Nếu có nguy hiểm tức thời, hãy đến cơ sở cấp cứu gần nhất."
      : /vui|hạnh phúc/i.test(value) ? "Nghe bạn chia sẻ niềm vui, mình cũng thấy ấm lòng. Bạn muốn kể thêm điều gì đã làm hôm nay đặc biệt không?"
      : /học|thi|áp lực|căng thẳng/i.test(value) ? "Có vẻ bạn đang mang khá nhiều áp lực. Điều gì trong chuyện học tập hay sinh hoạt khiến bạn mệt nhất lúc này?"
      : "Mình đang lắng nghe bạn đây. Bạn có muốn kể thêm điều đang khiến bạn bận lòng không? Bạn có thể chia sẻ theo nhịp của mình nhé.";
    setMessages(previous => [...previous, {role: "Bạn", content: value}, {role: "Lạc Lạc · phản hồi mẫu", content: answer}]);
    setText("");
    if (risk) onSupport();
    if (!window.speechSynthesis) { setError("Thiết bị chưa hỗ trợ đọc giọng nói. Bạn có thể bấm Hiện chữ để xem phản hồi mẫu."); return; }
    const utterance = new SpeechSynthesisUtterance(answer); utterance.lang = "vi-VN"; utterance.rate = 0.95;
    const voice = window.speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith("vi"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { if (turn === generation.current) setSpeaking(true); };
    utterance.onend = () => { if (turn === generation.current) setSpeaking(false); };
    utterance.onerror = () => { if (turn === generation.current) { setSpeaking(false); setError("Chưa phát được giọng đọc. Bấm Hiện chữ để xem phản hồi mẫu nhé."); } };
    window.speechSynthesis.speak(utterance);
  }
  function start() {
    if (listening) { recognition.current?.stop(); return; }
    stop(); setError("");
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setError("Trình duyệt chưa hỗ trợ nhận giọng nói. Hãy thử Chrome hoặc Edge, hoặc nhập câu bên dưới để thử giọng đọc."); return; }
    const instance = new Constructor(), turn = generation.current;
    let captured = "", failed = false;
    instance.lang = "vi-VN"; instance.interimResults = true; instance.continuous = false;
    instance.onresult = event => { if (turn !== generation.current) return; captured = Array.from(event.results).map(result => result[0].transcript).join(" "); setText(captured); };
    instance.onerror = event => { if (turn !== generation.current) return; failed = true; setListening(false); setError(event.error === "not-allowed" ? "Bạn hãy cho phép trình duyệt sử dụng micro rồi thử lại nhé." : "Chưa nhận được giọng nói. Kiểm tra micro và kết nối mạng, hoặc nhập câu để thử bên dưới."); };
    instance.onend = () => { if (turn !== generation.current) return; if (timer.current) clearTimeout(timer.current); recognition.current = null; setListening(false); if (!failed && captured.trim()) reply(captured); };
    recognition.current = instance;
    try { instance.start(); setListening(true); timer.current = setTimeout(() => instance.stop(), 45000); }
    catch { stop(); setError("Chưa mở được micro. Bạn hãy thử lại nhé."); }
  }
  return <div className="voice-page">
    <div className="chat-toolbar voice-chat-toolbar"><div className="chat-identity"><img src="/images/laclac/header-avatar.png" width="64" height="64" alt="Lạc Lạc" /><div><h2>Lạc Lạc</h2><p>Một người bạn, sẵn sàng lắng nghe</p></div></div><Link className="button secondary" href="/talk">Chuyển sang trò chuyện</Link></div>
    <p className="chat-notice">Đang thử Voice miễn phí · Phản hồi mẫu, không gọi OpenAI và không trừ hạn mức. Nhận giọng nói của trình duyệt có thể cần mạng; giọng đọc tùy thiết bị.</p>
    <div className={`voice-layout ${show ? "with-transcript" : ""}`}><section className="voice-stage panel">
      <div className={`laclac-voice ${listening ? "listening" : ""} ${speaking ? "speaking" : ""}`}><span className="laclac-voice-halo" aria-hidden="true" /><span className="laclac-speech-rings" aria-hidden="true"><span /><span /><span /></span><img src={`/images/laclac/${speaking ? ["speaking-soft", "speaking-open", "speaking-soft", "listening"][frame] : "listening"}-transparent.png`} alt="Lạc Lạc" /></div>
      <h2 aria-live="polite">{listening ? "Mình đang lắng nghe…" : speaking ? "Lạc Lạc đang đọc phản hồi mẫu…" : "Sẵn sàng thử cùng bạn"}</h2>
      <div className="voice-controls"><button className="mic-button" onClick={start}>{listening ? "Gửi" : "🎙"}</button><button className="round-button danger" aria-label="Kết thúc thử giọng" onClick={stop}>■</button><button className="transcript-toggle" aria-expanded={show} onClick={() => setShow(!show)}>{show ? "Ẩn chữ" : "Hiện chữ"}</button></div>
      <form onSubmit={event => { event.preventDefault(); reply(text); }} style={{display:"flex", gap:8, width:"min(100%, 480px)", margin:"12px auto"}}><input aria-label="Câu nói để thử" placeholder="Hoặc nhập câu để thử giọng đọc…" value={text} onChange={event => setText(event.target.value)} style={{minWidth:0, flex:1}} /><button className="button" type="submit" disabled={!text.trim()}>Thử</button></form>
      {error && <p role="alert">{error}</p>}
      <button className="text-link" onClick={onSupport}>Cần hỗ trợ ngay</button>
    </section><section className="panel transcript" hidden={!show}><h3>Phụ đề cuộc trò chuyện thử</h3>{messages.length ? messages.map((message,index) => <div className="transcript-item" key={index}><strong>{message.role}</strong><p>{message.content}</p></div>) : <p>Lời nói của bạn sẽ xuất hiện ở đây.</p>}</section></div>
  </div>;
}
