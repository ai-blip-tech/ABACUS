import assert from "node:assert/strict";
import test from "node:test";
import {
  clearTechnicalLightingAttempt,
  readTechnicalLightingAttempt,
  recoverTechnicalLightingResult,
  saveTechnicalLightingAttempt,
} from "../lib/technical-lighting-recovery.ts";

const attempt = {
  operationId: "11111111-2222-4333-8444-555555555555",
  fingerprint: "a".repeat(64),
  kind: "render",
  createdAt: 1_792_334_000_000,
};

test("a technical-lighting attempt survives a page reload", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  saveTechnicalLightingAttempt(storage, attempt);
  assert.deepEqual(readTechnicalLightingAttempt(storage), attempt);
  clearTechnicalLightingAttempt(storage);
  assert.equal(readTechnicalLightingAttempt(storage), null);
});

test("recovery polls status and downloads the stored image without a generation POST", async () => {
  const calls = [];
  let checks = 0;
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    assert.notEqual(String(url), "/api/generate");
    if (String(url).includes("/status?")) {
      checks += 1;
      return Response.json(checks === 1
        ? { status: "pending", operationId: attempt.operationId }
        : { status: "succeeded", operationId: attempt.operationId, imageUrl: `/api/account/generations/${attempt.operationId}` });
    }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/webp" } });
  };
  const result = await recoverTechnicalLightingResult(attempt.operationId, { fetcher, wait: async () => {}, intervalMs: 0, maximumChecks: 3 });
  assert.equal(result.blob.size, 3);
  assert.equal(calls.filter((call) => call.url.includes("/status?")).length, 2);
  assert.equal(calls.filter((call) => call.url.includes("/api/account/generations/")).length, 1);
  assert.equal(calls.filter((call) => call.method === "POST").length, 0);
});

test("a stuck operation is reported explicitly and never retried", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ status: "stuck", operationId: attempt.operationId, message: "Операция зависла. Повторный запрос провайдеру не отправлен." });
  };
  await assert.rejects(
    recoverTechnicalLightingResult(attempt.operationId, { fetcher, wait: async () => {}, maximumChecks: 2 }),
    /Операция зависла.*не отправлен/,
  );
  assert.equal(calls, 1);
});
