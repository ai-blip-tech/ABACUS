"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ItTurn, ItUiAction, ItVisualState, RoomDesignContext } from "@/lib/it/types";

type TranscriptItem = {
  id: string;
  role: "user" | "it";
  text: string;
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

const suggestions = [
  "Как заменить диван?",
  "Найди кресло до 150 тысяч",
  "Какой материал дивана выбрать?",
];

export default function ItOrb({ context, onAction }: ItOrbProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ItVisualState>("closed");
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<TranscriptItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setState("idle");
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

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

  const ask = async (message: string) => {
    const text = message.trim();
    if (!text || state === "thinking" || state === "searching") return;
    setValue("");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text }]);
    setState(/найди|подбери|каталог/i.test(text) ? "searching" : "thinking");
    try {
      const response = await fetch("/api/it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context }),
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
    void ask(value);
  };

  const toggle = () => {
    setOpen((current) => {
      setState(current ? "closed" : "idle");
      return !current;
    });
  };

  return (
    <aside className={`it-layer ${open ? "is-open" : "is-closed"}`} data-state={state} aria-label="Оно — интеллект Room Design">
      {open && (
        <section className="it-surface" aria-label="Разговор с Оно">
          <header className="it-surface-head">
            <div>
              <span>ОНО · ROOM DESIGN</span>
              <p><i aria-hidden="true"/> {stateLabel[state]}</p>
            </div>
            <button type="button" onClick={toggle} aria-label="Закрыть Оно">×</button>
          </header>

          <div className="it-transcript" ref={transcriptRef} aria-live="polite">
            {messages.length === 0 && (
              <div className="it-intro">
                <span>{context.section === "planogram" ? "СОЗДАНИЕ ИНТЕРЬЕРА" : "РЕДАКТОР ИЗОБРАЖЕНИЙ"}</span>
                <h2>Я вижу, где вы.</h2>
                <p>{context.render.hasSource
                  ? "Могу показать следующий шаг, найти предмет в каталоге или помочь с интерьерным решением."
                  : "Начните с вопроса. Если для действия понадобится интерьер, я подскажу, когда его загрузить."}</p>
              </div>
            )}
            {messages.map((message) => (
              <article key={message.id} className={`it-message it-message-${message.role}`}>
                <span>{message.role === "it" ? "ОНО" : "ВЫ"}</span>
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
          </div>

          {messages.length === 0 && (
            <div className="it-suggestions">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void ask(suggestion)}>{suggestion}<span>↗</span></button>)}
            </div>
          )}

          <form className="it-composer" onSubmit={submit}>
            <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Спросите о проекте или интерьере" aria-label="Сообщение для Оно"/>
            <button type="submit" disabled={!value.trim() || state === "thinking" || state === "searching"} aria-label="Отправить">↑</button>
          </form>
          <footer><span>Контекст проекта включён</span><i/><span>Действия под вашим контролем</span></footer>
        </section>
      )}

      <button className="it-orb" type="button" onClick={toggle} aria-expanded={open} aria-label={open ? "Свернуть Оно" : "Открыть Оно"}>
        <span className="it-orb-glass" aria-hidden="true">
          <i className="it-liquid it-liquid-a"/>
          <i className="it-liquid it-liquid-b"/>
          <i className="it-glint"/>
        </span>
        {!open && <em>Оно</em>}
      </button>
    </aside>
  );
}
