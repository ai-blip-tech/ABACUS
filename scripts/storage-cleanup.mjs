import { runStorageCleanup } from "../lib/storage-cleanup.ts";

const execute = process.argv.includes("--execute");
const result = await runStorageCleanup({ dryRun: !execute });
console.log(JSON.stringify(result, null, 2));
if (result.failed > 0) process.exitCode = 1;
