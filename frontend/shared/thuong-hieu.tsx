// Logo + "Tư vấn tâm lý" wordmark, shared by the student sidebar, the admin/expert sidebar and the login page.
import Link from "next/link";
import "./thuong-hieu.css";

export function BrandWordmark({
  className = "",
  tagline = "LẮNG NGHE • ĐỒNG HÀNH",
  href = "/",
}: {
  className?: string;
  tagline?: string;
  href?: string;
}) {
  return (
    <Link href={href} className={`brand-wordmark ${className}`} aria-label="Tư vấn tâm lý – Lắng nghe, đồng hành">
      <img className="supplied-brand-logo" src="/images/logo-tuvantamly.jpg" alt="" />
      <span className="brand-text" aria-hidden="true">
        <span className="brand-title">
          <span className="brand-title-words"><span>Tư</span>{" "}<span>vấn</span>{" "}<span>tâm</span>{" "}<span>lý</span></span>
          <svg className="brand-leaf" viewBox="0 0 24 20">
            <path d="M2,18 C4,8 12,2 23,2 C22,12 14,19 2,18 Z" />
            <path className="vein" d="M3,17 C9,12 14,8 20,4" />
          </svg>
        </span>
        <svg className="brand-swoosh" viewBox="0 0 200 26">
          <path d="M6,12 C50,4 100,6 132,13 C150,17 165,20 176,17" />
          <path d="M176,17 C171,12 168,6 173,4 C177,2 180,6 181,8 C183,4 188,3 190,7 C192,12 186,16 176,17 Z" />
          <path className="spark" d="M188,0 L186,4 M195,5 L191,7" />
        </svg>
        <span className="brand-sub">{tagline}</span>
      </span>
    </Link>
  );
}
