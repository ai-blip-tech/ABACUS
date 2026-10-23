"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadImageAsJpeg } from "@/lib/client-image-download";
import "./editor-image-actions.css";

export default function EditorImageActions({ image, name, onError }: { image: string; name: string; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; trigger.current?.focus(); };
  }, [open]);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try { await downloadImageAsJpeg(image, name); }
    catch { onError("Не удалось скачать изображение. Попробуйте ещё раз."); }
    finally { setDownloading(false); }
  };
  const downloadIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg>;
  return <>
    <div className="editor-image-actions" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <button type="button" onClick={() => void download()} disabled={downloading} aria-label="Скачать изображение" title="Скачать изображение">{downloadIcon}</button>
      <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-label="Открыть изображение на весь экран" title="Открыть на весь экран"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button>
    </div>
    {open && createPortal(<dialog ref={dialog} className="editor-image-dialog" aria-label="Полноэкранный просмотр изображения" onCancel={() => setOpen(false)} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="editor-image-dialog-actions"><button type="button" onClick={() => void download()} disabled={downloading} aria-label="Скачать изображение" title="Скачать изображение">{downloadIcon}</button><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть полноэкранный просмотр" title="Закрыть">×</button></div>
      <img src={image} alt={name || "Изображение интерьера"}/>
    </dialog>, document.body)}
  </>;
}
