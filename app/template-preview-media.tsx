"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { TemplateDefinition } from "@/lib/templates/types";

type TemplatePreviewMediaProps = {
  preview: TemplateDefinition["preview"];
  className: string;
  sizes: string;
  priority?: boolean;
};

export default function TemplatePreviewMedia({ preview, className, sizes, priority = false }: TemplatePreviewMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const hasVideo = preview.type === "video" && Boolean(preview.videoSrc) && !videoFailed && !reduceMotion;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    }, { rootMargin: "180px 0px", threshold: 0.05 });

    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [hasVideo]);

  if (!hasVideo) {
    return <Image className={className} src={preview.src} alt={preview.alt} fill sizes={sizes} priority={priority} />;
  }

  return (
    <video
      ref={videoRef}
      className={className}
      muted
      loop
      playsInline
      preload="metadata"
      poster={preview.src}
      aria-label={preview.alt}
      onError={() => setVideoFailed(true)}
    >
      <source src={preview.videoSrc} type={preview.videoMimeType || "video/mp4"} />
      Ваш браузер не поддерживает видео-превью.
    </video>
  );
}
