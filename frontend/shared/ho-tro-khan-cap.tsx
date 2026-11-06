"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseMedical, Clock, Globe, HandHeart, Headphones, Info, Phone, Siren, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import "./ho-tro-khan-cap.css";

type Contact = { name: string; number?: string; href: string; description: string; hours?: string; icon: LucideIcon };

// Public contacts verified on 2026-10-28. See docs/auth-design.vi.md for sources.
const contacts: Contact[] = [
  { name: "Cấp cứu y tế", number: "115", href: "tel:115", description: "Toàn quốc – cấp cứu y tế", icon: BriefcaseMedical },
  { name: "Công an", number: "113", href: "tel:113", description: "Khi có nguy hiểm, cần công an hỗ trợ", icon: Siren },
  {
    name: "Đường dây nóng Ngày Mai",
    number: "+84963061414",
    href: "tel:+84963061414?oai_link_source=model_response_hotline",
    description: "Hỗ trợ tinh thần",
    hours: "13:00 – 20:30, thứ Tư đến Chủ nhật",
    icon: Headphones,
  },
  { name: "Tổng đài quốc gia bảo vệ trẻ em", number: "111", href: "tel:111", description: "Hỗ trợ bảo vệ trẻ em · 24/7", icon: HandHeart },
];

export default function SupportDialog({ close }: { close: () => void }) {
  const [additionalContacts, setAdditionalContacts] = useState<Contact[]>([]);
  useEffect(() => {
    let active = true;
    api<any[]>("/content/support")
      .then((items) => {
        if (!active) return;
        const existing = new Set(contacts.map((c) => c.href.split("?")[0].replace(/\D/g, "")));
        setAdditionalContacts(
          items
            .filter((c) => !c.phone || !existing.has(String(c.phone).replace(/\D/g, "")))
            // Website-only resources open the site instead of dialling.
            .map((c) => ({
              name: c.title,
              number: c.phone || undefined,
              href: c.phone ? `tel:${String(c.phone).replace(/[^+\d]/g, "")}` : c.website,
              description: c.region,
              hours: c.hours,
              icon: c.phone ? Phone : Globe,
            })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const dialog = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])") || []);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="sd-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div ref={dialog} className="sd-dialog" role="dialog" aria-modal="true" aria-labelledby="urgent-support-title" aria-describedby="urgent-support-description">
        <svg className="sd-waves" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          <path className="a" d="M600,0 C720,40 820,10 1000,60 L1000,0 Z" />
          <path className="b" d="M0,250 C180,190 320,280 520,240 C700,205 820,250 1000,215 L1000,300 L0,300 Z" />
          <path className="c" d="M0,280 C220,240 380,300 600,270 C780,248 880,285 1000,262 L1000,300 L0,300 Z" />
        </svg>
        <button ref={closeButton} type="button" className="sd-close" onClick={close} aria-label="Đóng hỗ trợ ngay">
          <X size={24} />
        </button>
        <h2 id="urgent-support-title">Bạn không phải đối mặt một mình</h2>
        <p id="urgent-support-description">Nếu bạn hoặc ai đó đang gặp nguy hiểm, hãy gọi ngay:</p>
        <div className="sd-contacts">
          {[...contacts, ...additionalContacts].map(({ name, number, href, description, hours, icon: Icon }) => (
            <a key={href} href={href} className="sd-contact" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
              <span className="sd-icon" aria-hidden="true"><Icon size={30} strokeWidth={1.7} /></span>
              <span className="sd-name">
                {name}
                {number && (
                  <>
                    <span className="sd-dash"> – </span>
                    <span className="sd-number">{number}</span>
                  </>
                )}
              </span>
              <span className="sd-about">
                {description}
                {hours && (
                  <small>
                    <Clock size={15} />
                    {hours}
                  </small>
                )}
              </span>
            </a>
          ))}
        </div>
        <p className="sd-note">
          <Info size={22} strokeWidth={1.8} />
          <span>Các số liên hệ dành cho Việt Nam. Ngày Mai có giờ hoạt động riêng và không thay thế dịch vụ cấp cứu. Lạc Lạc không tự gọi hoặc điều phối cứu hộ.</span>
        </p>
      </div>
    </div>
  );
}
