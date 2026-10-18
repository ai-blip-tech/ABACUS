export type TechnicalLightingAttempt = {
  operationId: string;
  fingerprint: string;
  kind: "render" | "upscale";
  createdAt: number;
};

export type TechnicalLightingOperationStatus = {
  status: "pending" | "succeeded" | "failed" | "stuck";
  operationId: string;
  imageUrl?: string;
  message?: string;
};

export const TECHNICAL_LIGHTING_ATTEMPT_KEY = "room-design:technical-lighting:pending-operation:v1";

type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Fetcher = typeof fetch;

const validAttempt = (value: unknown): value is TechnicalLightingAttempt => {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<TechnicalLightingAttempt>;
  return typeof attempt.operationId === "string"
    && /^[a-zA-Z0-9-]{8,128}$/.test(attempt.operationId)
    && typeof attempt.fingerprint === "string"
    && /^[a-f0-9]{64}$/.test(attempt.fingerprint)
    && (attempt.kind === "render" || attempt.kind === "upscale")
    && typeof attempt.createdAt === "number";
};

export function readTechnicalLightingAttempt(storage: AttemptStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(TECHNICAL_LIGHTING_ATTEMPT_KEY) || "null") as unknown;
    return validAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTechnicalLightingAttempt(storage: AttemptStorage, attempt: TechnicalLightingAttempt) {
  storage.setItem(TECHNICAL_LIGHTING_ATTEMPT_KEY, JSON.stringify(attempt));
}

export function clearTechnicalLightingAttempt(storage: AttemptStorage) {
  storage.removeItem(TECHNICAL_LIGHTING_ATTEMPT_KEY);
}

export async function readTechnicalLightingOperationStatus(operationId: string, fetcher: Fetcher = fetch) {
  const response = await fetcher(`/api/lighting/generate/status?operationId=${encodeURIComponent(operationId)}`, {
    method: "GET",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Partial<TechnicalLightingOperationStatus> & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Не удалось проверить состояние генерации.");
  return payload as TechnicalLightingOperationStatus;
}

export async function recoverTechnicalLightingResult(operationId: string, options: {
  fetcher?: Fetcher;
  wait?: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
  maximumChecks?: number;
  onPending?: (message: string) => void;
} = {}) {
  const fetcher = options.fetcher || fetch;
  const wait = options.wait || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const intervalMs = options.intervalMs ?? 2_000;
  const maximumChecks = options.maximumChecks ?? 125;
  for (let check = 0; check < maximumChecks; check += 1) {
    let status: TechnicalLightingOperationStatus;
    try {
      status = await readTechnicalLightingOperationStatus(operationId, fetcher);
    } catch (error) {
      if (check === maximumChecks - 1) throw error;
      options.onPending?.("Связь прервалась. Проверяем сохранённый результат…");
      await wait(intervalMs);
      continue;
    }
    if (status.status === "succeeded" && status.imageUrl) {
      const imageResponse = await fetcher(status.imageUrl, { method: "GET", cache: "no-store" });
      if (!imageResponse.ok) throw new Error("Результат создан, но сохранённое изображение пока недоступно.");
      return { blob: await imageResponse.blob(), status };
    }
    if (status.status === "failed") throw new Error(status.message || "Генерация завершилась ошибкой. Новое списание не выполнялось.");
    if (status.status === "stuck") throw new Error(status.message || "Операция зависла. Повторный запрос провайдеру не отправлен.");
    options.onPending?.(status.message || "Генерация продолжается. Проверяем готовый результат…");
    await wait(intervalMs);
  }
  throw new Error("Операция всё ещё выполняется. Повторный запрос провайдеру не отправлен; нажмите кнопку ещё раз, чтобы проверить статус.");
}
