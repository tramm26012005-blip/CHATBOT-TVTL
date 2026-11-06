import type { Metadata } from "next";
import "./globals.css";
import "../../shared/noi-dung-font.css";
import "../../shared/mau-thao-tac.css";
export const metadata: Metadata = {
  title: "Tư vấn tâm lý · Một khoảng bình yên cho bạn",
  description:
    "Không gian đồng hành cùng sức khỏe tinh thần sinh viên. Trò chuyện, lắng nghe và chăm sóc bản thân theo cách của bạn.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
