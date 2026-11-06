"use client";

import { useEffect, useRef, useState } from "react";
import { Wind, X } from "lucide-react";

export default function BreathingGuide({ onStop }: { onStop: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  const inhaling = step < 5;
  const count = inhaling ? step + 1 : 10 - step;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let elapsed = 0;
    let finishTimer: number | undefined;
    const timer = window.setInterval(() => {
      elapsed += 1;
      if (elapsed >= 10) {
        window.clearInterval(timer);
        element?.classList.add("breathing-guide-finishing");
        finishTimer = window.setTimeout(() => {
          element?.close();
          onStopRef.current();
        }, 900);
        return;
      }
      setStep(elapsed);
    }, 1000);
    return () => { window.clearInterval(timer); window.clearTimeout(finishTimer); element?.close(); };
  }, []);

  return (
    <dialog ref={dialog} className="breathing-guide" aria-labelledby="breathing-guide-title" onCancel={event => { event.preventDefault(); onStop(); }}>
      <button type="button" className="breathing-guide-close" aria-label="Đóng hướng dẫn thở" onClick={onStop} autoFocus><X size={20} /></button>
      <span className="eyebrow">MỘT KHOẢNG NGHỈ CHO BẠN</span>
      <h2 id="breathing-guide-title" aria-live="polite">{inhaling ? "Hít vào nhẹ nhàng" : "Thở ra chậm…"}</h2>
      <div className={`breathing-guide-orb ${inhaling ? "inhale" : "exhale"}`} key={inhaling ? "inhale" : "exhale"}>
        <span className="breathing-guide-count" aria-label={`${count}`}>{count}</span>
      </div>
      <p>{inhaling ? "Hít vào theo nhịp đếm 1 đến 5." : "Thả lỏng vai và nhẹ nhàng thở ra."}</p>
      <p className="breathing-guide-hint">Thở theo mức thoải mái của bạn. Có thể dừng bất cứ lúc nào.</p>
      <button type="button" className="button primary" onClick={onStop}><Wind size={17} /> Dừng thư giãn</button>
    </dialog>
  );
}
