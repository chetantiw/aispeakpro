/**
 * Thin wrapper over the browser Web Speech API for the MVP web client.
 * (On mobile — the real target — this is replaced by the on-device recognizer
 * or a streaming STT provider over WebRTC.) Minimal typings inline since the
 * Web Speech API is not in the standard DOM lib.
 */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type Ctor = new () => SpeechRecognitionLike;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" &&
    !!((window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition);
}

export function createRecognizer(onFinal: (text: string) => void): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.onresult = (e) => {
    const text = e.results?.[0]?.[0]?.transcript?.trim();
    if (text) onFinal(text);
  };
  return rec;
}

/** Speak text using the browser's built-in TTS (placeholder for ElevenLabs/Cartesia). */
export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  window.speechSynthesis.speak(u);
}
