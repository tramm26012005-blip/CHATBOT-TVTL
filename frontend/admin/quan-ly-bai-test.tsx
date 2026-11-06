"use client";
import {useEffect,useState,type FormEvent} from "react";
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Clock3,Eye,FileText,Info,Layers,MessageCircleQuestion,Pencil,Save} from "lucide-react";
import {api} from "@/lib/api";
import "./quan-ly-bai-test.css";

export type AssessmentInfo={definition:{id:string;version:string;instructions:string;items:{id:number;options:{value:number;text:string}[]}[]};verified:boolean;records:{id:string;created:string}[]};
export default function AssessmentView({data,error,reload}:{data:AssessmentInfo|null;error:string;reload:()=>void}){
  const[selected,setSelected]=useState(1),[options,setOptions]=useState<string[]>([]),[choice,setChoice]=useState(1);
  const[editing,setEditing]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[saveError,setSaveError]=useState("");
  useEffect(()=>{if(data)setOptions(data.definition.items.find(row=>row.id===selected)?.options.map(row=>row.text)||[]);},[data,selected]);
  const item=data?.definition.items.find(row=>row.id===selected);
  const index=data?.definition.items.findIndex(row=>row.id===selected)??0;
  function choose(id:number){setSelected(id);setChoice(1);setMessage("");setSaveError("");}
  async function save(event:FormEvent){event.preventDefault();if(selected===9||!editing)return;setBusy(true);setSaveError("");setMessage("");try{await api("/admin/assessments",{method:"PUT",body:JSON.stringify({question_id:selected,options})});setMessage("Đã lưu nội dung bản nháp.");reload();}catch(e){setSaveError((e as Error).message);}finally{setBusy(false);}}
  if(!data)return error?<div className="notice error" role="alert"><p>{error}</p><button className="text-link" onClick={reload}>Thử lại</button></div>:<p role="status">Đang tải bộ câu hỏi…</p>;
  return <div className="assessment-management" aria-label="Quản lý bài test">
    <h1 className="assessment-page-title">Quản lý bài test</h1>
    <div className="assessment-stats">
      <article className="assessment-stat peach"><span className="assessment-stat-icon"><FileText/></span><div><strong>{data.definition.items.length}</strong><span>Nhóm câu hỏi</span></div></article>
      <article className="assessment-stat green"><span className="assessment-stat-icon"><CheckCircle2/></span><div><strong>{data.records.length}</strong><span>Kết quả được đồng ý lưu</span></div></article>
      <article className="assessment-stat gold"><span className="assessment-stat-icon"><BookOpen/></span><div><strong className="assessment-status-text">{data.verified?"Đã xác minh":"Bản tham khảo"}</strong><span>Trạng thái bộ câu hỏi</span></div></article>
    </div>
    <section className="assessment-editor">
      <header className="assessment-toolbar"><h2><Layers size={20} aria-hidden="true"/>Bộ câu hỏi · {data.definition.version}</h2><div className="assessment-tools"><button className="assessment-tool preview" aria-pressed={!editing} onClick={()=>setEditing(false)}><Eye size={16}/>Xem trước</button><button className="assessment-tool edit" aria-pressed={editing} onClick={()=>setEditing(true)}><Pencil size={16}/>Chỉnh sửa</button></div></header>
      <p className="assessment-instructions"><Info size={15} aria-hidden="true"/>{data.definition.instructions}</p>
      <div className="assessment-navigation"><label>Chọn câu hỏi<select aria-label="Chọn câu hỏi" value={selected} disabled={busy} onChange={e=>choose(Number(e.target.value))}>{data.definition.items.map(row=><option key={row.id} value={row.id}>Câu {row.id}</option>)}</select></label><div><button className="assessment-previous" disabled={busy||index<=0} onClick={()=>choose(data.definition.items[index-1].id)}><ArrowLeft size={14}/>Câu trước</button><button className="assessment-next" disabled={busy||index>=data.definition.items.length-1} onClick={()=>choose(data.definition.items[index+1].id)}>Câu tiếp theo<ArrowRight size={14}/></button></div></div>
      <form onSubmit={save}>
        <fieldset className="assessment-question" disabled={busy}><legend><MessageCircleQuestion size={19} aria-hidden="true"/>Câu {selected}: {options[0]||"Nội dung câu hỏi"}</legend><div className="assessment-options">{options.map((text,i)=><div key={`${selected}-${i}`} className={`assessment-option ${choice===i?"is-selected":""}`}><input type="radio" name="assessment-preview-choice" checked={choice===i} onChange={()=>setChoice(i)} aria-label={`Chọn thử đáp án ${i} · ${item?.options[i].value} điểm`}/><span className="assessment-option-label">Đáp án {i} - {item?.options[i].value} điểm</span>{editing?<textarea aria-label={`Nội dung đáp án ${i}`} rows={1} required maxLength={2000} value={text} disabled={selected===9||busy} onChange={e=>setOptions(old=>old.map((v,n)=>n===i?e.target.value:v))}/>:<label onClick={()=>setChoice(i)}>{text}</label>}</div>)}</div></fieldset>
        <footer className="assessment-editor-footer"><p><Info size={14} aria-hidden="true"/>Chỉnh lời câu hỏi sẽ đưa bộ test về bản nháp chưa xác minh chuyên môn. Câu số 9 được khóa để giữ kiểm tra an toàn; điểm số không chỉnh tại đây.</p><button className="assessment-save" disabled={selected===9||busy||!editing}><Save size={16}/>{busy?"Đang lưu…":"Lưu nội dung bản nháp"}</button></footer>
      </form>
      {message&&<p role="status" className="assessment-message">{message}</p>}{saveError&&<p role="alert" className="assessment-error">{saveError}</p>}
    </section>
    <section className="assessment-history"><h2><Clock3 size={19} aria-hidden="true"/>Lịch sử thực hiện đã lưu</h2><div className="admin-table-scroll"><table><thead><tr><th>Mã kết quả</th><th>Thời gian</th></tr></thead><tbody>{data.records.map(row=><tr key={row.id}><td>{row.id}</td><td>{new Date(row.created).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</td></tr>)}{!data.records.length&&<tr><td className="assessment-empty" colSpan={2}>Chưa có kết quả được lưu.</td></tr>}</tbody></table></div></section>

  </div>;
}
