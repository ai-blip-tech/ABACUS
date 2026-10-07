"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ItTurn, ItUiAction, ItVisualState, RoomDesignContext } from "@/lib/it/types";
import OnoOrb, { type OnoState } from "./ono-orb";

type TranscriptItem = {
  id: string;
  role: "user" | "it";
  text: string;
  image?: string;
  products?: ItTurn["products"];
};

type ItOrbProps = {
  context: RoomDesignContext;
  onAction: (action: ItUiAction) => void;
};

const stateLabel: Record<ItVisualState, string> = {
  closed: "Оно рядом",
  idle: "Слушает контекст",
  listening: "Слушает",
  thinking: "Думает",
  speaking: "Отвечает",
  searching: "Ищет в каталоге",
  moving: "Показывает",
  acting: "Готовит действие",
  success: "Нашло",
  error: "Нужна пауза",
};

const onoState: Record<ItVisualState, OnoState> = {
  closed: "idle",
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  searching: "thinking",
  moving: "moving",
  acting: "thinking",
  success: "success",
  error: "error",
};

const suggestions = [
  "Как заменить диван?",
  "Найди кресло до 150 тысяч",
  "Какой материал дивана выбрать?",
];

const imageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) return reject(new Error("Выберите PNG, JPEG или WebP."));
  if (file.size > 8 * 1024 * 1024) return reject(new Error("Изображение должно быть не больше 8 МБ."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
  reader.readAsDataURL(file);
});

export default function ItOrb({ context, onAction }: ItOrbProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ItVisualState>("closed");
  const [value, setValue] = useState("");
  const [pendingImage, setPendingImage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [orbHovered, setOrbHovered] = useState(false);
  const [orbKeyboardFocused, setOrbKeyboardFocused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [guideOffset, setGuideOffset] = useState<{ x: number; y: number } | null>(null);
  const [messages, setMessages] = useState<TranscriptItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const guideTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);

  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => () => {
    if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
    void audioContextRef.current?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    setState("idle");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const guide = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail) return;
      const reopen = openRef.current;
      if (reopen) setOpen(false);
      if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
      window.setTimeout(() => {
        const orb = document.querySelector<HTMLButtonElement>(".it-orb");
        if (!orb) return;
        const rect = orb.getBoundingClientRect();
        setGuideOffset({ x: detail.x - (rect.left + rect.width / 2), y: detail.y - (rect.top + rect.height / 2) });
      }, 80);
      guideTimerRef.current = window.setTimeout(() => {
        setGuideOffset(null);
        if (reopen) setOpen(true);
      }, 3600);
    };
    window.addEventListener("it:guide", guide);
    return () => {
      window.removeEventListener("it:guide", guide);
      if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, state]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        setState("closed");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const ask = async (message: string, image = "") => {
    const text = message.trim() || (image ? "Проанализируй прикреплённое изображение." : "");
    if (!text || state === "thinking" || state === "searching" || isTranscribing) return;
    setValue("");
    setPendingImage("");
    setComposerError("");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text, image: image || undefined }]);
    setState(/найди|подбери|каталог/i.test(text) ? "searching" : "thinking");
    try {
      const response = await fetch("/api/it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          image: image || undefined,
          context,
          history: messages.slice(-12).map((item) => ({
            role: item.role === "it" ? "assistant" : "user",
            text: item.text,
            image: item.image,
            products: item.products,
          })),
        }),
      });
      const payload = await response.json() as ItTurn & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось получить ответ.");
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "it", text: payload.text, products: payload.products }]);
      setState(payload.state);
      payload.actions?.forEach(onAction);
    } catch (error) {
      setMessages((items) => [...items, {
        id: crypto.randomUUID(),
        role: "it",
        text: error instanceof Error ? error.message : "Не удалось ответить. Попробуйте ещё раз.",
      }]);
      setState("error");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(value, pendingImage);
  };

  const attachImage = async (file?: File) => {
    if (!file) return;
    try {
      setPendingImage(await imageAsDataUrl(file));
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Не удалось добавить изображение.");
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const transcribe = async (blob: Blob) => {
    setIsTranscribing(true);
    setState("thinking");
    try {
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "message.m4a" : "message.webm");
      const response = await fetch("/api/it/transcribe", { method: "POST", body: form });
      const payload = await response.json() as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Не удалось распознать запись.");
      setIsTranscribing(false);
      await ask(payload.text, pendingImage);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Не удалось распознать запись.");
      setState("idle");
      setIsTranscribing(false);
    }
  };

  const toggleRecording = async () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setIsRecording(false);
      setAudioLevel(0);
      if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
      if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setComposerError("Запись голоса не поддерживается этим браузером.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      let audioContext: AudioContext | null = null;
      try {
        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = .72;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        audioContextRef.current = audioContext;
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const readLevel = () => {
          analyser.getByteTimeDomainData(samples);
          let energy = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            energy += centered * centered;
          }
          setAudioLevel(Math.min(1, Math.sqrt(energy / samples.length) * 4.6));
          audioFrameRef.current = requestAnimationFrame(readLevel);
        };
        readLevel();
      } catch {
        // Voice recording must keep working even when Web Audio is unavailable.
        setAudioLevel(0);
      }
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
        audioFrameRef.current = null;
        setAudioLevel(0);
        if (audioContext) void audioContext.close().catch(() => undefined);
        audioContextRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        recordingChunksRef.current = [];
        if (blob.size) void transcribe(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setComposerError("");
      setIsRecording(true);
      setState("listening");
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
        setIsRecording(false);
        setAudioLevel(0);
      }, 60_000);
    } catch {
      setComposerError("Разрешите доступ к микрофону, чтобы записать сообщение.");
      setState("idle");
    }
  };

  const toggle = () => {
    setOpen((current) => {
      setState(current ? "closed" : "idle");
      return !current;
    });
  };

  const visualState: OnoState = (() => {
    const agentState = onoState[state];
    if (agentState !== "idle") return agentState;
    if (open && value.trim()) return "composing";
    if (open) return "openReady";
    if (orbHovered || orbKeyboardFocused) return "hoverReady";
    return "idle";
  })();

  return (
    <aside className={`it-layer ${open ? "is-open" : "is-closed"}${guideOffset ? " is-guiding" : ""}`} style={guideOffset ? { "--it-guide-x": `${guideOffset.x}px`, "--it-guide-y": `${guideOffset.y}px` } as CSSProperties : undefined} data-state={state} aria-label="Оно — интеллект Room Design">
      {open && (
        <section className={`it-surface${messages.length === 0 ? " is-empty" : ""}`} aria-label="Разговор с Оно">
          <header className="it-surface-head">
            <div>
              <span>ОНО · ROOM DESIGN</span>
              <p><i aria-hidden="true"/> {stateLabel[state]}</p>
            </div>
            <button type="button" onClick={toggle} aria-label="Закрыть Оно">×</button>
          </header>

          {messages.length > 0 && <div className="it-transcript" ref={transcriptRef} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`it-message it-message-${message.role}`}>
                <span>{message.role === "it" ? "ОНО" : "ВЫ"}</span>
                {message.image && <img className="it-message-image" src={message.image} alt="Изображение, прикреплённое к сообщению"/>}
                <p>{message.text}</p>
                {message.products && message.products.length > 0 && (
                  <div className="it-products">
                    {message.products.map((product, index) => (
                      <a key={product.id} href={product.url || undefined} target={product.url ? "_blank" : undefined} rel="noreferrer">
                        <span className="it-product-index">0{index + 1}</span>
                        <img src={product.image} alt=""/>
                        <div><b>{product.name}</b><small>{product.material || product.color || product.category}</small><strong>{new Intl.NumberFormat("ru-RU").format(product.price)} ₽</strong></div>
                        <i aria-hidden="true">↗</i>
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {(state === "thinking" || state === "searching") && (
              <div className="it-process"><span/><span/><span/><p>{stateLabel[state]}</p></div>
            )}
          </div>}

          {messages.length === 0 && (
            <div className="it-suggestions">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void ask(suggestion)}>{suggestion}<span>↗</span></button>)}
            </div>
          )}

          {pendingImage && <div className="it-image-draft"><img src={pendingImage} alt="Изображение перед отправкой"/><span>Изображение прикреплено</span><button type="button" onClick={() => setPendingImage("")} aria-label="Убрать изображение">×</button></div>}
          {composerError && <p className="it-composer-error" role="alert">{composerError}</p>}
          <form className={`it-composer${isRecording ? " is-recording" : ""}`} onSubmit={submit}>
            <input ref={imageInputRef} className="it-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void attachImage(event.target.files?.[0])}/>
            <button className="it-composer-tool" type="button" onClick={() => imageInputRef.current?.click()} aria-label="Прикрепить изображение" title="Прикрепить изображение">⌕</button>
            <button className="it-composer-tool it-mic" type="button" onClick={() => void toggleRecording()} aria-label={isRecording ? "Остановить и отправить голосовое сообщение" : "Записать голосовое сообщение"} title={isRecording ? "Остановить запись" : "Записать голосом"}><span aria-hidden="true"/></button>
            <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Спросите о проекте или интерьере" aria-label="Сообщение для Оно"/>
            <button className="it-send" type="submit" disabled={(!value.trim() && !pendingImage) || state === "thinking" || state === "searching" || isRecording || isTranscribing} aria-label="Отправить">↑</button>
          </form>
          <footer><span>Контекст проекта включён</span><i/><span>Действия под вашим контролем</span></footer>
        </section>
      )}

      <button
        className="it-orb"
        type="button"
        onClick={toggle}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") setOrbHovered(true); }}
        onPointerLeave={() => setOrbHovered(false)}
        onFocus={(event) => setOrbKeyboardFocused(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setOrbKeyboardFocused(false)}
        aria-expanded={open}
        aria-label={open ? "Свернуть Оно" : "Открыть Оно"}
      >
        <OnoOrb
          state={visualState}
          size={open ? 96 : 56}
          expanded={open}
          velocityX={guideOffset?.x || 0}
          velocityY={guideOffset?.y || 0}
          audioLevel={audioLevel}
        />
        {!open && <em>Оно</em>}
      </button>
    </aside>
  );
}
