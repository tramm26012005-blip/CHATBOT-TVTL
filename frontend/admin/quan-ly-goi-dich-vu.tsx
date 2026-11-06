"use client";
import {ArrowRight} from "lucide-react";
import {adminMoney,type AdminTarget} from "@/lib/admin-center";
import "./quan-ly-goi-dich-vu.css";

export type ServicePlan={name:string;price:number;duration:string;questions:number;seconds:number|null};
export default function ServicePlans({data,error,reload,go}:{data:ServicePlan[]|null;error:string;reload:()=>void;go:(target:AdminTarget)=>void}){
  return <div className="service-plan-management">
    <header className="service-plan-heading"><h1>Quản lý gói dịch vụ</h1><p>Các quyền lợi đang áp dụng cho tài khoản. Giá và giới hạn này đồng bộ với cấu hình gói hiện có.</p></header>
    {!data?(error?<div role="alert" className="notice error"><p>{error}</p><button className="text-link" onClick={reload}>Thử lại</button></div>:<p role="status">Đang tải gói dịch vụ…</p>):<div className="service-plan-grid">{data.map(row=><section key={row.name} className={`service-plan-card ${row.price?"is-vip":"is-normal"}`}>
      <h2>{row.name}</h2><strong className="service-plan-price">{adminMoney(row.price)}</strong><span className="service-plan-duration">{row.duration}</span>
      <ul><li>{row.questions} lượt hỏi / ngày, dùng chung chat và voice.</li><li>{row.seconds===null?"Không giới hạn thời gian theo gói thường.":`${row.seconds/60} phút / ngày, chạm giới hạn nào trước thì dừng.`}</li><li>{row.price?"Lịch sử, chuyên gia, lịch hẹn, thăm khám, góc bình yên và cài đặt đầy đủ.":"Test tâm lý, hỗ trợ khẩn cấp, đổi mật khẩu và đăng xuất."}</li></ul>
      <button className="service-plan-members" onClick={()=>go("users")}>Quản lý thành viên<ArrowRight size={25} strokeWidth={1.5} aria-hidden="true"/></button>
      <svg className="service-plan-waves" viewBox="0 0 500 170" preserveAspectRatio="none" aria-hidden="true"><path d="M0 170C90 146 122 75 225 97S337 6 500 0V170Z"/><path d="M50 170C157 162 200 126 287 116S391 58 500 54V170Z"/></svg>
    </section>)}</div>}
    <button className="service-plan-settings" onClick={()=>go("system")}>Cài đặt thanh toán mô phỏng</button>
  </div>;
}
