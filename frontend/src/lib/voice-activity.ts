/** End a turn after speech followed by a natural pause; never submit initial silence. */
export function createVoiceActivity(startedAt: number) {
  let speechMs = 0, lastVoiceAt = startedAt, previousAt = startedAt;
  let noise = 0.004;
  return (rms: number, now: number): "listening" | "submit" | "silent" => {
    const elapsed = Math.min(100, Math.max(0, now - previousAt));
    previousAt = now;
    const threshold = Math.max(0.012, noise * 2.8);
    if (rms >= threshold) {
      speechMs += elapsed;
      lastVoiceAt = now;
    } else if (speechMs < 200) {
      noise = noise * 0.97 + Math.min(rms, 0.02) * 0.03;
    }
    if (speechMs >= 200 && now - lastVoiceAt >= 1100) return "submit";
    if (speechMs < 200 && now - startedAt >= 12000) return "silent";
    return "listening";
  };
}
