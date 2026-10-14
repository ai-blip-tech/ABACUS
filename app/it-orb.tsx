"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ItTurn, ItUiAction, ItVisualState, RoomDesignContext } from "@/lib/it/types";
import type { OnoWidgetEvent } from "@/lib/it/embed-contract";
import type { OnoStreamEvent, OnoProgressStage } from "@/lib/it/stream";
import OnoOrb, { type OnoState } from "./ono-orb";

type TranscriptItem = {
  id: string;
  role: "user" | "it";
  text: string;
  image?: string;
  products?: ItTurn["products"];
  visionAnalysis?: ItTurn["visionAnalysis"];
  sources?: ItTurn["sources"];
};

type ItOrbProps = {
  context: RoomDesignContext;
  onAction: (action: ItUiAction) => void;
  suggestions?: string[];
  closedLabel?: string;
  brandLabel?: string;
  headerTitle?: string;
  onWidgetEvent?: (event: OnoWidgetEvent) => void;
  placement?: "floating" | "hero";
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

const defaultSuggestions = [
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

export default function ItOrb({ context, onAction, suggestions = defaultSuggestions, closedLabel = "Оно", brandLabel = "ROOM DESIGN", headerTitle, onWidgetEvent, placement = "floating" }: ItOrbProps) {
  const isHero = placement === "hero";
  const [open, setOpen] = useState(isHero);
  const [state, setState] = useState<ItVisualState>(isHero ? "idle" : "closed");
  const [value, setValue] = useState("");
  const [pendingImage, setPendingImage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [orbHovered, setOrbHovered] = useState(false);
  const [orbKeyboardFocused, setOrbKeyboardFocused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [progressLabel, setProgressLabel] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
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
  const activeRequestRef = useRef<AbortController | null>(null);
  const openRef = useRef(open);
  const composerPlaceholder = isHero ? "Спросите «ОНО», загрузите пространство или опишите задачу" : context.template ? "Спросите об этом шаблоне" : context.page === "templates" ? "Опишите задачу — подберу шаблон" : "Спросите о проекте или интерьере";
  const contextLabel = context.template ? `Контекст: ${context.template.title}` : context.page === "templates" ? "Каталог шаблонов известен" : "Контекст страницы включён";

  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    setIsHistoryLoading(true);
    fetch("/api/it", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { sessionId?: string; messages?: Array<{ id: string; role: "user" | "assistant"; text: string; products?: ItTurn["products"] }>; error?: string };
        if (!response.ok) throw new Error(payload.error || "Не удалось восстановить диалог.");
        setSessionId(payload.sessionId || "");
        setMessages((current) => current.length ? current : (payload.messages || []).map((message) => ({ ...message, role: message.role === "assistant" ? "it" : "user" })));
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setComposerError(error.message); })
      .finally(() => setIsHistoryLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    activeRequestRef.current?.abort();
    if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
    void audioContextRef.current?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open || isHero) return;
    setState("idle");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isHero, open]);

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
      if (event.key === "Escape" && open && !isHero) {
        setOpen(false);
        setState("closed");
        onWidgetEvent?.({ type: "widget.closed" });
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isHero, onWidgetEvent, open]);

  const ask = async (message: string, image = "") => {
    const text = message.trim() || (image ? "Проанализируй прикреплённое изображение." : "");
    if (!text || state === "thinking" || state === "searching" || isTranscribing) return;
    setValue("");
    setPendingImage("");
    setComposerError("");
    setProgressLabel(image ? "Анализирую изображение" : "Разбираюсь в задаче");
    onWidgetEvent?.({ type: "ono.message.sent", hasImage: Boolean(image) });
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text, image: image || undefined }]);
    setState(/найди|подбери|каталог/i.test(text) ? "searching" : "thinking");
    const assistantId = crypto.randomUUID();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    const stageState: Record<OnoProgressStage, ItVisualState> = {
      accepted: "thinking",
      analyzing: "thinking",
      thinking: "thinking",
      searching: "searching",
      comparing: "searching",
      finalizing: "speaking",
    };
    try {
      const response = await fetch("/api/it", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        signal: requestController.signal,
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          sessionId: sessionId || undefined,
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
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Не удалось получить ответ.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasAssistant = false;
      let finalTurn: ItTurn | null = null;
      const applyEvent = (event: OnoStreamEvent) => {
        if (event.type === "progress") {
          setProgressLabel(event.label);
          setState(stageState[event.stage]);
        } else if (event.type === "text_delta") {
          if (!hasAssistant) {
            hasAssistant = true;
            setMessages((items) => [...items, { id: assistantId, role: "it", text: event.delta }]);
          } else {
            setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, text: `${item.text}${event.delta}` } : item));
          }
        } else if (event.type === "result") {
          finalTurn = event.turn;
          if (event.sessionId) setSessionId(event.sessionId);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      };
      while (true) {
        const { value: chunk, done } = await reader.read();
        buffer += decoder.decode(chunk || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) if (line.trim()) applyEvent(JSON.parse(line) as OnoStreamEvent);
        if (done) break;
      }
      if (buffer.trim()) applyEvent(JSON.parse(buffer) as OnoStreamEvent);
      if (!finalTurn) throw new Error("Поток завершился без результата.");
      const payload = finalTurn as ItTurn;
      setMessages((items) => {
        const complete = { id: assistantId, role: "it" as const, text: payload.text, products: payload.products, visionAnalysis: payload.visionAnalysis, sources: payload.sources };
        return items.some((item) => item.id === assistantId) ? items.map((item) => item.id === assistantId ? complete : item) : [...items, complete];
      });
      setState(payload.state);
      if (payload.products?.length) onWidgetEvent?.({ type: "ono.catalog.results", count: payload.products.length });
      if (payload.handoffRequested) onWidgetEvent?.({ type: "handoff.requested" });
      payload.actions?.forEach(onAction);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessages((items) => items.some((item) => item.id === assistantId) ? items : [...items, { id: assistantId, role: "it", text: "Запрос остановлен." }]);
        setState("idle");
        return;
      }
      setMessages((items) => [...items, {
        id: crypto.randomUUID(),
        role: "it",
        text: error instanceof Error ? error.message : "Не удалось ответить. Попробуйте ещё раз.",
      }]);
      setState("error");
    } finally {
      if (activeRequestRef.current === requestController) activeRequestRef.current = null;
      setProgressLabel("");
    }
  };

  const newConversation = async () => {
    if (state === "thinking" || state === "searching") return;
    try {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const response = await fetch(`/api/it${query}`, { method: "DELETE" });
      const payload = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось начать новый диалог.");
      setSessionId(payload.sessionId || "");
      setMessages([]);
      setComposerError("");
      setState("idle");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Не удалось начать новый диалог.");
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
      form.append("requestId", crypto.randomUUID());
      if (sessionId) form.append("sessionId", sessionId);
      const response = await fetch("/api/it/transcribe", { method: "POST", body: form });
      const payload = await response.json() as { text?: string; sessionId?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "Не удалось распознать запись.");
      if (payload.sessionId) setSessionId(payload.sessionId);
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
      onWidgetEvent?.(current ? { type: "widget.closed" } : { type: "widget.opened", source: "orb" });
      return !current;
    });
  };

  const visualState: OnoState = (() => {
    const agentState = onoState[state];
    if (agentState !== "idle") return agentState;
    if (value.trim()) return "composing";
    if (open && !isHero) return "openReady";
    if (orbHovered || orbKeyboardFocused) return "hoverReady";
    return "idle";
  })();

  if (isHero) {
    return (
      <aside className="it-hero" data-state={state} aria-label="ОНО — ваш ИИ-ассистент">
        <button
          className="it-hero-orb"
          type="button"
          onPointerEnter={(event) => { if (event.pointerType !== "touch") setOrbHovered(true); }}
          onPointerLeave={() => setOrbHovered(false)}
          onFocus={(event) => setOrbKeyboardFocused(event.currentTarget.matches(":focus-visible"))}
          onBlur={() => setOrbKeyboardFocused(false)}
          onClick={() => inputRef.current?.focus()}
          aria-label="Перейти к сообщению для ОНО"
        >
          <OnoOrb state={visualState} size={360} expanded={false} audioLevel={audioLevel} />
        </button>

        {messages.length > 0 && (
          <section className="it-hero-response" aria-label="Разговор с ОНО">
            <header>
              <span><i aria-hidden="true" /> {stateLabel[state]}</span>
              <button type="button" onClick={() => void newConversation()} disabled={isHistoryLoading} aria-label="Начать новый диалог">Новый диалог</button>
            </header>
            <div className="it-transcript" ref={transcriptRef} aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`it-message it-message-${message.role}`}>
                  <span>{message.role === "it" ? "ОНО" : "ВЫ"}</span>
                  {message.image && <img className="it-message-image" src={message.image} alt="Изображение, прикреплённое к сообщению" />}
                  <p>{message.text}</p>
                  {message.visionAnalysis && (
                    <div className="it-vision" aria-label="Наблюдения по изображению">
                      <b>Вижу на фото</b>
                      <div>{[...message.visionAnalysis.categories, ...message.visionAnalysis.colors, ...message.visionAnalysis.materials, ...message.visionAnalysis.styles].slice(0, 8).map((item) => <span key={item}>{item}</span>)}</div>
                      <small>{message.visionAnalysis.requiresConfirmation ? "Спорные признаки уточню перед точным поиском." : `Уверенность: ${message.visionAnalysis.confidence}.`}</small>
                    </div>
                  )}
                  {message.products && message.products.length > 0 && (
                    <div className="it-products">
                      {message.products.map((product, index) => (
                        <a key={product.id} href={product.url || undefined} target={product.url ? "_blank" : undefined} rel="noreferrer" onClick={() => {
                          onWidgetEvent?.({ type: "user.click_product", productId: product.id });
                          if (product.url) onWidgetEvent?.({ type: "widget.link_opened", href: product.url });
                        }}>
                          <span className="it-product-index">0{index + 1}</span>
                          <img src={product.image} alt="" />
                          <div><b>{product.name}</b><small>{product.material || product.color || product.category}</small><strong>{new Intl.NumberFormat("ru-RU").format(product.price)} ₽</strong></div>
                          <i aria-hidden="true">↗</i>
                        </a>
                      ))}
                    </div>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="it-sources" aria-label="Источники ответа">
                      <b>Источники</b>
                      {message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}
                    </div>
                  )}
                </article>
              ))}
              {(state === "thinking" || state === "searching") && (
                <div className="it-process"><span /><span /><span /><p>{progressLabel || stateLabel[state]}</p><button type="button" onClick={() => activeRequestRef.current?.abort()}>Остановить</button></div>
              )}
            </div>
          </section>
        )}

        {pendingImage && <div className="it-image-draft"><img src={pendingImage} alt="Изображение перед отправкой" /><span>Изображение прикреплено</span><button type="button" onClick={() => setPendingImage("")} aria-label="Убрать изображение">×</button></div>}
        {composerError && <p className="it-composer-error" role="alert">{composerError}</p>}
        <form className={`it-composer it-hero-composer${isRecording ? " is-recording" : ""}`} onSubmit={submit}>
          <input ref={imageInputRef} className="it-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void attachImage(event.target.files?.[0])} />
          <button className="it-composer-tool it-hero-image-tool" type="button" onClick={() => imageInputRef.current?.click()} aria-label="Прикрепить изображение" title="Прикрепить изображение">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="4" width="17" height="16" rx="2" />
              <circle cx="8.3" cy="9" r="1.5" />
              <path d="m5.5 17 4.1-4.2 3.1 3 2.1-2.1 3.7 3.3" />
            </svg>
          </button>
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={composerPlaceholder} aria-label="Сообщение для ОНО" />
          <button className="it-composer-tool it-mic" type="button" onClick={() => void toggleRecording()} aria-label={isRecording ? "Остановить и отправить голосовое сообщение" : "Записать голосовое сообщение"} title={isRecording ? "Остановить запись" : "Записать голосом"}><span aria-hidden="true" /></button>
          <button className="it-send" type="submit" disabled={(!value.trim() && !pendingImage) || state === "thinking" || state === "searching" || isRecording || isTranscribing} aria-label="Отправить">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 11.5 15.5-7-5.2 15.1-3.1-6.1L4 11.5Z" />
              <path d="m11.2 13.5 4-4" />
            </svg>
          </button>
        </form>
        <div className="it-hero-suggestions" aria-label="Примеры вопросов для ОНО">
          {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => {
            setValue(suggestion);
            onWidgetEvent?.({ type: "widget.opened", source: "hero_suggestion" });
            requestAnimationFrame(() => inputRef.current?.focus());
          }}>{suggestion}</button>)}
        </div>
      </aside>
    );
  }

  return (
    <aside className={`it-layer ${open ? "is-open" : "is-closed"}${guideOffset ? " is-guiding" : ""}`} style={guideOffset ? { "--it-guide-x": `${guideOffset.x}px`, "--it-guide-y": `${guideOffset.y}px` } as CSSProperties : undefined} data-state={state} aria-label="Оно — интеллект Room Design">
      {open && (
        <section className={`it-surface${messages.length === 0 ? " is-empty" : ""}`} aria-label="Разговор с Оно">
          <header className="it-surface-head">
            <div>
              <span>{headerTitle || (brandLabel ? `ОНО · ${brandLabel}` : "ОНО")}</span>
              <p><i aria-hidden="true"/> {stateLabel[state]}</p>
            </div>
            <div className="it-surface-actions">
              <button type="button" onClick={() => void newConversation()} disabled={isHistoryLoading || !messages.length} aria-label="Начать новый диалог">Новый диалог</button>
              <button type="button" onClick={toggle} aria-label="Закрыть Оно">×</button>
            </div>
          </header>

          {messages.length > 0 && <div className="it-transcript" ref={transcriptRef} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`it-message it-message-${message.role}`}>
                <span>{message.role === "it" ? "ОНО" : "ВЫ"}</span>
                {message.image && <img className="it-message-image" src={message.image} alt="Изображение, прикреплённое к сообщению"/>}
                <p>{message.text}</p>
                {message.visionAnalysis && (
                  <div className="it-vision" aria-label="Наблюдения по изображению">
                    <b>Вижу на фото</b>
                    <div>
                      {[...message.visionAnalysis.categories, ...message.visionAnalysis.colors, ...message.visionAnalysis.materials, ...message.visionAnalysis.styles]
                        .slice(0, 8)
                        .map((item) => <span key={item}>{item}</span>)}
                    </div>
                    <small>{message.visionAnalysis.requiresConfirmation ? "Спорные признаки уточню перед точным поиском." : `Уверенность: ${message.visionAnalysis.confidence}.`}</small>
                  </div>
                )}
                {message.products && message.products.length > 0 && (
                  <div className="it-products">
                    {message.products.map((product, index) => (
                      <a key={product.id} href={product.url || undefined} target={product.url ? "_blank" : undefined} rel="noreferrer" onClick={() => {
                        onWidgetEvent?.({ type: "user.click_product", productId: product.id });
                        if (product.url) onWidgetEvent?.({ type: "widget.link_opened", href: product.url });
                      }}>
                        <span className="it-product-index">0{index + 1}</span>
                        <img src={product.image} alt=""/>
                        <div><b>{product.name}</b><small>{product.material || product.color || product.category}</small><strong>{new Intl.NumberFormat("ru-RU").format(product.price)} ₽</strong></div>
                        <i aria-hidden="true">↗</i>
                      </a>
                    ))}
                  </div>
                )}
                {message.sources && message.sources.length > 0 && (
                  <div className="it-sources" aria-label="Источники ответа">
                    <b>Источники</b>
                    {message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}
                  </div>
                )}
              </article>
            ))}
            {(state === "thinking" || state === "searching") && (
              <div className="it-process"><span/><span/><span/><p>{progressLabel || stateLabel[state]}</p><button type="button" onClick={() => activeRequestRef.current?.abort()}>Остановить</button></div>
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
            <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={composerPlaceholder} aria-label="Сообщение для Оно"/>
            <button className="it-send" type="submit" disabled={(!value.trim() && !pendingImage) || state === "thinking" || state === "searching" || isRecording || isTranscribing} aria-label="Отправить">↑</button>
          </form>
          <footer><span>{contextLabel}</span><i/><span>История хранится 30 дней</span></footer>
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
        aria-label={open ? "Свернуть Оно" : `Открыть Оно: ${closedLabel}`}
      >
        <OnoOrb
          state={visualState}
          size={open ? 96 : 56}
          expanded={open}
          velocityX={guideOffset?.x || 0}
          velocityY={guideOffset?.y || 0}
          audioLevel={audioLevel}
        />
        {!open && <em>{closedLabel}</em>}
      </button>
    </aside>
  );
}
