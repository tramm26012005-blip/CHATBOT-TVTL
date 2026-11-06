"use client";
import {useEffect,useRef,useState} from "react";
import {api} from "@/lib/api";
import "./khung-gio-ranh.css";
type Slot={time:string;available:boolean;reason:string};
export default function AvailableSlots({expertId,date,value,onChange,onReady,bookingId}:{expertId:string;date:string;value:string;onChange:(time:string)=>void;onReady:(ready:boolean)=>void;bookingId?:string}){
  const[slots,setSlots]=useState<Slot[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const latest=useRef({value,onChange,onReady});latest.current={value,onChange,onReady};
  useEffect(()=>{
    if(!date){setSlots([]);latest.current.onReady(false);return;}
    const abort=new AbortController();setLoading(true);setError("");setSlots([]);latest.current.onReady(false);
    const load=()=>api<{slots:Slot[]}>(`/experts/${expertId}/availability?date=${encodeURIComponent(date)}${bookingId?`&booking_id=${encodeURIComponent(bookingId)}`:""}`,{signal:abort.signal}).then(d=>{
      if(abort.signal.aborted)return;setSlots(d.slots);setError("");setLoading(false);
      const selected=d.slots.find(s=>s.time===latest.current.value&&s.available);
      if(!selected)latest.current.onChange(d.slots.find(s=>s.available)?.time||"");
      latest.current.onReady(d.slots.some(s=>s.available));
    }).catch(e=>{if(!abort.signal.aborted){setError(e.message);setLoading(false);latest.current.onReady(false);}});
    load();const id=setInterval(load,15000);return()=>{abort.abort();clearInterval(id);};
  },[expertId,date,bookingId]);
  return <section className="available-slots" aria-label="Giờ rảnh của chuyên gia"><h3>Chọn giờ tư vấn · giờ Việt Nam</h3>{!date?<p>Chọn ngày để xem giờ rảnh.</p>:loading?<p role="status">Đang kiểm tra lịch…</p>:<>
    {error&&<p role="alert">{error}</p>}
    <div className="available-slot-grid">{slots.map(slot=><button key={slot.time} type="button" className={`${!slot.available?"is-busy":""} ${value===slot.time&&slot.available?"is-selected":""}`} disabled={!slot.available||!!error} aria-pressed={slot.available&&value===slot.time} aria-label={`${slot.time} · ${slot.available?"Còn trống":slot.reason}`} title={slot.reason||"Còn trống · 30 phút"} onClick={()=>latest.current.onChange(slot.time)}>{slot.time}<small>{slot.available?"Còn trống":slot.reason}</small></button>)}</div>
    {!error&&!slots.some(s=>s.available)&&<p>Ngày này không còn giờ rảnh. Bạn hãy chọn ngày khác.</p>}
  </>}<small>Giờ mờ là giờ bận, ngoài lịch rảnh hoặc đã qua và không thể chọn.</small></section>;
}
