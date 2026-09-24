import { useRef, useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Notice } from "../../shared/ui/primitives";
import { formatClock } from "../../shared/ui/timers";

/**
 * Голосовая заметка.
 *
 * Иногда проще проговорить, чем напечатать — особенно после тренировки.
 * Запись сохраняется всегда; расшифровка делается на сервере, если там
 * настроен ключ, и её отсутствие ничего не ломает.
 */
export function VoiceRecorder({ entryId, onSaved }: { entryId: number; onSaved: () => void }) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef<number>(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Браузер не умеет записывать звук. Текстом — тоже нормально.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const form = new FormData();
        form.append("audio", blob, "note.webm");
        form.append(
          "duration_seconds",
          String(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))),
        );
        await api.post(`/journal/entries/${entryId}/voice/`, form);
        onSaved();
      };
      recorder.start();
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setRecording(true);
      timerRef.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)),
        500,
      );
    } catch {
      setError("Микрофон недоступен.");
    }
  };

  const stop = () => {
    window.clearInterval(timerRef.current);
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
  };

  return (
    <div className="stack stack--tight">
      {recording ? (
        <Button variant="primary" onClick={stop}>
          Остановить · {formatClock(elapsed)}
        </Button>
      ) : (
        <Button onClick={() => void start()}>Голосовая заметка</Button>
      )}
      {error && <Notice tone="info">{error}</Notice>}
    </div>
  );
}
