import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", ".next", "node_modules", "data"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) files.push(path);
  }
  return files;
}

test("production build is standard Next.js for Node", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.equal(packageJson.dependencies.next, "16.3.6");
  for (const forbidden of ["vinext", "wrangler", "@cloudflare/vite-plugin", "@openai/sites-vite-plugin"]) {
    assert.equal(packageJson.dependencies?.[forbidden], undefined);
    assert.equal(packageJson.devDependencies?.[forbidden], undefined);
  }
});

test("application source has no Cloudflare runtime imports", async () => {
  const sourceRoots = ["app", "lib"];
  const files = (await Promise.all(sourceRoots.map((directory) => sourceFiles(join(root, directory))))).flat();
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/cloudflare:|@cloudflare\/|getCloudflareContext|wrangler|vinext/i.test(source)) matches.push(file);
  }
  assert.deepEqual(matches, []);
});

test("Node deployment artifacts exist and hosting manifest is absent", async () => {
  await access(new URL("../next.config.ts", import.meta.url));
  await access(new URL("../ecosystem.config.cjs", import.meta.url));
  await access(new URL("../lib/server-runtime.ts", import.meta.url));
  await assert.rejects(access(new URL("../.openai/hosting.json", import.meta.url)));
});

test("image generation is configurable and rejects placeholder secrets", async () => {
  const modelSource = await readFile(new URL("../lib/image-model.ts", import.meta.url), "utf8");
  const configSource = await readFile(new URL("../lib/server-config.ts", import.meta.url), "utf8");
  const generateSource = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");

  assert.match(modelSource, /gpt-image-2\.5-sunburst/);
  assert.match(modelSource, /OPENAI_IMAGE_MODEL/);
  assert.match(configSource, /replace-me/);
  assert.match(configSource, /your-openai-api-key/);
  assert.match(configSource, /your-roboflow-api-key/);
  assert.match(generateSource, /openAIKey\(\)/);
  assert.match(generateSource, /imageModel\(\)/);
});

test("health endpoint reports image-generation readiness without exposing a secret", async () => {
  const healthSource = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(healthSource, /imageGeneration/);
  assert.match(healthSource, /configured/);
  assert.doesNotMatch(healthSource, /OPENAI_API_KEY/);
});

test("admin brutto coefficient is 2.2", async () => {
  const adminSource = await readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(adminSource, /BRUTTO_MULTIPLIER\s*=\s*2\.2/);
  assert.match(pageSource, /\*\s*2\.2/);
});

test("planogram keeps menus readable, rugs below furniture, and supports bedside tables", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const controlsSource = await readFile(new URL("../app/planogram-controls.ts", import.meta.url), "utf8");
  const catalogSource = await readFile(new URL("../app/api/catalog/route.ts", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(pageSource, /type:\s*"nightstand"\s*,\s*name:\s*"Прикроватная тумба"/);
  assert.match(pageSource, /kind:\s*"nightstand"\s*,\s*name:\s*"Прикроватная тумба"/);
  assert.match(catalogSource, /type\s*===\s*"nightstand"/);
  assert.match(controlsSource, /keepMenuHorizontal/);
  assert.match(controlsSource, /--no-rotation/);
  assert.match(stylesSource, /\.planogram-furniture\.rug[^}]*z-index:\s*1!important/);
  assert.match(stylesSource, /\.planogram-furniture:not\(\.rug\)[^{]*\{z-index:\s*2\}/);
  assert.match(stylesSource, /\.planogram-editor-board \.planogram-furniture>span\{display:none!important\}/);
});
