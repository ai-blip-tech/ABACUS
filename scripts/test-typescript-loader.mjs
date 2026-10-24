import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Do not depend on the optional TypeScript support compiled into a Node binary.
export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !/\.tsx?$/.test(new URL(url).pathname)) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const result = ts.transpileModule(await readFile(filename, 'utf8'), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }));
  return { format: 'module', source: result.outputText, shortCircuit: true };
}
