import type { Message } from "./api";

const openings: Record<string, string> = {
  "Vui vẻ": "Bạn vừa chọn cảm xúc vui vẻ — mình rất vui được nghe điều đó. Hôm nay có chuyện gì khiến bạn vui vậy?",
  "Bình yên": "Bạn vừa chọn cảm xúc bình yên. Điều gì đang mang lại cho bạn cảm giác dễ chịu ấy?",
  "Bình thường": "Cảm ơn bạn đã chia sẻ rằng hôm nay mình cảm thấy bình thường. Có điều gì trong ngày mà bạn muốn kể mình nghe không?",
  "Hơi buồn": "Bạn vừa chia sẻ rằng mình hơi buồn. Mình ở đây để lắng nghe; bạn có muốn kể điều gì đang khiến lòng mình nặng hơn không?",
  "Căng thẳng": "Bạn vừa chọn cảm xúc căng thẳng. Điều gì đang tạo nhiều áp lực cho bạn lúc này?",
};

// Explicitly shared by clicking “Kể mình nghe thêm”. No browser persistence.
let pending: { userId: string; mood: string; expires: number } | null = null;

export function clearMoodContext() { pending = null; }

export function setMoodContext(userId: string, mood: string) {
  pending = userId && Object.hasOwn(openings, mood) ? { userId, mood, expires: Date.now() + 10 * 60 * 1000 } : null;
}

export function takeMoodContext(userId: string): Message[] | null {
  const value = pending;
  pending = null;
  if (!value || value.userId !== userId || Date.now() >= value.expires) return null;
  return [
    { role: "user", content: `Cảm xúc mình chọn hôm nay: ${value.mood}. Mình muốn chia sẻ thêm.` },
    { role: "assistant", content: openings[value.mood] },
  ];
}
