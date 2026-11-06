// Shared by the student healing page and the admin music manager.
export const musicCategories: { name: string; icon: string }[] = [
  { name: "Thư giãn", icon: "🌿" },
  { name: "Giảm căng thẳng", icon: "🌧️" },
  { name: "Tập trung", icon: "📖" },
  { name: "Dễ ngủ", icon: "☾" },
  { name: "Chữa lành", icon: "♡" },
  { name: "Tích cực", icon: "☀" },
];

export const musicCategoryIcons: Record<string, string> = {
  "Tất cả": "♫",
  ...Object.fromEntries(musicCategories.map((c) => [c.name, c.icon])),
};

// Seeded library tracks carry public attribution in channel/source_title.
export function musicCredit(track: { channel?: string; source_title?: string }) {
  return track.channel
    ? `YouTube · ${track.channel}${track.source_title ? ` · ${track.source_title}` : ""}. Phát qua trình phát YouTube chính thức; quyền nội dung thuộc tác giả.`
    : "";
}
