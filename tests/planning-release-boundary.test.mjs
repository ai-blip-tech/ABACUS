import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
test('manual release contains no experimental AI route, model calls, prompts or skill bundle',()=>{
 const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
 for(const p of ['app/api/projects/[id]/planning-plan/generate','lib/planning-plan/ai-generator.ts','lib/planning-plan/skill-bundle.ts','app/planning-plan/planner-brief.tsx','app/planning-plan/ai-report.tsx'])assert.equal(existsSync(new URL(p,root)),false,p);
 const route=read('app/api/projects/[id]/planning-plan/route.ts');assert.doesNotMatch(route,/planningAIConfig|createDemoVariants|updatePlanningBrief|generatePlanningVariants|save-brief|start-demo|create-demo/);
 for(const dir of ['lib/planning-plan','app/planning-plan'])for(const name of readdirSync(new URL(dir,root)).filter(n=>/\.tsx?$/.test(n)))assert.doesNotMatch(read(join(dir,name)),/api\.openai\.com|callPlanningOpenAI|OR-Tools|shapely|skill-bundle/);
});
