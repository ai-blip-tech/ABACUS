import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlanCompass} from '../app/plan-compass.tsx';
test('shared compass is accessible and fixed in the top-right of its canvas',()=>{
 const html=renderToStaticMarkup(React.createElement(PlanCompass,{onReset:()=>{}}));
 assert.match(html,/aria-label="Вернуть план в исходный вид"/);assert.match(html,/position:absolute;top:12px;right:12px/);assert.match(html,/type="button"/);
 assert.match(renderToStaticMarkup(React.createElement(PlanCompass,{onReset:()=>{},disabled:true})),/disabled=""/);
});
test('both editors put compass outside the panned and scaled SVG and reset default camera',()=>{
 const measured=readFileSync('app/measured-plan/editor/measure-app.tsx','utf8'),partition=readFileSync('app/partition-plan/page.tsx','utf8');
 assert.match(measured,/className="measure-board"><PlanCompass/);assert.match(measured,/<PlanCompass onReset=\{\(\)=>\{setPan\(\{x:0,y:0,zoom:1\}\)/);
 assert.match(partition,/className="partition-canvas"[^\n]+<PlanCompass/);assert.match(partition,/<PlanCompass disabled=\{busy\} onReset=\{\(\)=>\{setZoom\(1\);setOffset\(\[0,0\]\)/);
 const body=readFileSync('app/plan-compass.tsx','utf8');assert.match(body,/e.stopPropagation\(\);onReset\(\)/);
});
