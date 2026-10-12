import type { ItTurn } from "./types.ts";

export type OnoProgressStage = "accepted" | "analyzing" | "thinking" | "searching" | "comparing" | "finalizing";

export type OnoStreamEvent =
  | { type: "progress"; stage: OnoProgressStage; label: string; elapsedMs: number }
  | { type: "text_delta"; delta: string }
  | { type: "result"; turn: ItTurn; sessionId: string; requestId: string; timing: { firstEventMs: number; totalMs: number } }
  | { type: "error"; message: string; requestId: string };

const labels: Record<OnoProgressStage, string> = {
  accepted: "Запрос принят",
  analyzing: "Анализирую изображение",
  thinking: "Разбираюсь в задаче",
  searching: "Ищу товары",
  comparing: "Сравниваю варианты",
  finalizing: "Готовлю ответ",
};

export const onoProgressEvent = (stage: OnoProgressStage, elapsedMs: number): OnoStreamEvent => ({
  type: "progress",
  stage,
  label: labels[stage],
  elapsedMs: Math.max(0, Math.round(elapsedMs)),
});

export const encodeOnoStreamEvent = (event: OnoStreamEvent) => `${JSON.stringify(event)}\n`;

export const splitOnoTextForStreaming = (text: string) => {
  const chunks = text.match(/\S+\s*/g) || [];
  return chunks.length ? chunks : [text];
};
