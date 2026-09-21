import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ROOM Design application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ROOM design — ИИ-платформа для дизайнеров интерьера<\/title>/i);
  assert.match(html, /ИИ-платформа/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /Could not resolve OpenAIHosting\.json/i);
});

test("build configuration is independent of OpenAI Hosting", async () => {
  const [viteConfig, packageJsonText, wranglerConfig] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonText);

  assert.equal(packageJson.name, "room-design");
  assert.match(packageJson.scripts.build, /(?:^|\s)vinext build$/);
  assert.equal(packageJson.dependencies?.["@openai/sites-vite-plugin"], undefined);
  assert.doesNotMatch(viteConfig, /@openai\/sites-vite-plugin|hosting\.json|OpenAIHosting/i);
  assert.match(viteConfig, /binding:\s*"DB"/);
  assert.match(viteConfig, /binding:\s*"GENERATIONS"/);
  assert.match(wranglerConfig, /"binding":\s*"DB"/);
  assert.match(wranglerConfig, /"binding":\s*"GENERATIONS"/);
});
