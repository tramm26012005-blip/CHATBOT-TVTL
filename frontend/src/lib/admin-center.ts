export type AdminTarget="overview"|"users"|"experts"|"conversations"|"bookings"|"assessments"|"packages"|"payments"|"reports"|"content"|"system";
export type PaymentRow={id:string;user:string;service:string;amount:number;created:string;demo:boolean;status:string;note?:string};
export type AdminMetrics={conversations:{total:number;week:number};assessments:{total:number;week:number};conversation_series:{day:string;conversations:number}[];topic_distribution:unknown[];topic_note:string;measurement_note:string;finance:{demo:boolean;real_total:number|null;total:number;vip:number;consultation:number;admin_commission:number;held:number;pending:number;refund_requests:number;refunded:number;months:{month:string;vip:number;consultation:number}[];recent:PaymentRow[]}};
export type DashboardPayload={management:AdminMetrics;stats:{students:{total:number;change:number|null};experts:{published:number;accounts:number};ai_requests:{total:number;week:number;change:number|null};bookings_today:{total:number;change:number|null}};series:{day:string;new_users:number;ai_requests:number}[];accounts:{normal:number;vip:number;expert:number;admin:number};recent_users:{id:string;name:string;email:string;created_at:string|null;is_active:boolean}[];upcoming_bookings:{id:string;starts_at:string;student_name:string;expert_name:string;status:string}[];pending_bookings:number};
export const adminMoney=(value:number)=>`${value.toLocaleString("vi-VN")}đ`;
export const paymentStatus:Record<string,string>={held:"Admin đang giữ · mô phỏng",success:"Thành công · mô phỏng",refund_requested:"Yêu cầu hoàn · mô phỏng",refunded:"Đã hoàn · mô phỏng"};
export function exportAdminCsv(name:string,rows:(string|number)[][]){
  const quote=(value:string|number)=>{let text=String(value);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`;};
  // Tell Excel the delimiter explicitly, regardless of Windows regional settings.
  const url=URL.createObjectURL(new Blob(["\uFEFFsep=,\r\n"+rows.map(row=>row.map(quote).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
