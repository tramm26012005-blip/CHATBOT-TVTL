"use client";
import {useEffect,useState,type FormEvent} from "react";
import {api,ApiError} from "@/lib/api";
import "./lich-ranh.css";

type Window={weekday:number;start:string;end:string};
const days=["Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"];
const times=Array.from({length:49},(_,i)=>`${Math.floor(i/2).toString().padStart(2,"0")}:${i%2?"30":"00"}`);
export default function WeeklyAvailability(){
  const[windows,setWindows]=useState<Window[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[attempt,setAttempt]=useState(0);
  useEffect(()=>{const abort=new AbortController();setError("");setLoaded(false);api<{windows:Window[]}>("/expert/availability",{signal:abort.signal}).then(d=>{setWindows(d.windows);setLoaded(true);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof ApiError&&e.status===404&&e.message==="Not Found"?"Backend đang chạy chưa cập nhật chức năng lịch rảnh. Khởi động lại backend rồi bấm Thử lại.":e.message);});return()=>abort.abort();},[attempt]);
  function change(index:number,key:"start"|"end",value:string){setMessage("");setWindows(old=>old.map((w,i)=>i===index?{...w,[key]:value}:w));}
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError("");setMessage("");try{const d=await api<{windows:Window[]}>("/expert/availability",{method:"PUT",body:JSON.stringify({windows})});setWindows(d.windows);setMessage("Đã lưu lịch rảnh hằng tuần. Sinh viên có thể đặt các giờ trống trong lịch này.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="weekly-availability"><h1>Lịch rảnh hằng tuần</h1><p>Chọn ngày và khoảng giờ bạn có thể tư vấn. Lịch lặp lại mỗi tuần theo giờ Việt Nam; mỗi lượt đặt giữ 30 phút. Ngoài lịch rảnh hoặc đã có người đặt sẽ không nhận thêm lịch.</p><p>Thay đổi này áp dụng cho lượt đặt mới. Các lịch đã nhận vẫn được giữ; muốn hủy cần xử lý riêng để hoàn tiền cho sinh viên.</p>
    {error&&<div role="alert" className="notice error"><p>{error}</p>{!loaded&&<button className="button outline" onClick={()=>setAttempt(n=>n+1)}>Thử lại</button>}</div>}{message&&<p role="status" className="notice success">{message}</p>}
    {!loaded?(error?null:<p role="status">Đang tải lịch…</p>):<form onSubmit={save}><fieldset disabled={busy}><legend>Ngày và giờ rảnh</legend>{days.map((day,weekday)=><section key={day} className="weekly-day"><header><h2>{day}</h2><button type="button" className="button outline" onClick={()=>{setMessage("");setWindows(old=>[...old,{weekday,start:"08:00",end:"09:00"}]);}}>Thêm giờ rảnh</button></header>{!windows.some(w=>w.weekday===weekday)&&<p className="weekly-off">Không nhận lịch</p>}{windows.map((w,index)=>w.weekday===weekday?<div key={index} className="weekly-window"><label>Từ<select aria-label={`${day} bắt đầu ${index+1}`} value={w.start} onChange={e=>change(index,"start",e.target.value)}>{times.slice(0,-1).map(t=><option key={t}>{t}</option>)}</select></label><label>Đến<select aria-label={`${day} kết thúc ${index+1}`} value={w.end} onChange={e=>change(index,"end",e.target.value)}>{times.slice(1).map(t=><option key={t}>{t}</option>)}</select></label><button className="button outline" type="button" onClick={()=>{setMessage("");setWindows(old=>old.filter((_,i)=>i!==index));}}>Xóa khoảng giờ</button></div>:null)}</section>)}<button className="button primary" disabled={busy}>{busy?"Đang lưu…":"Lưu lịch hằng tuần"}</button></fieldset></form>}
  </section>;
}
