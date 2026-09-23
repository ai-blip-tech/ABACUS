import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);

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
  const files = (await Promise.all(sourceRoots.map((directory) => sourceFiles(join(root.pathname, directory))))).flat();
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
