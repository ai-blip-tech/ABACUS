import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDoc} from '../lib/measured-plan/measure-model.ts';
import {planHeightLabels} from '../lib/measured-plan/measure-heights.ts';
function sample(){const d=fixtureDoc({name:'test',mime:'image/png',hash:'test',width:100,height:100,page:1,pages:1,method:'prepared-user-bti',image:'',words:[],pixelScale:1});d.height=2800;return d;}
test('common height is uppercase Latin H with equals and explicit mm units',()=>{const d=sample();assert.equal(planHeightLabels(d).common,'H = 2800 мм — общая высота стен');assert.deepEqual(planHeightLabels(d).walls,[]);d.walls[0].height=2800;assert.deepEqual(planHeightLabels(d).walls,[]);});
test('different wall heights receive individual annotations without mutating the plan',()=>{const d=sample();d.walls[0].height=2600;d.walls[1].height=3000;const before=JSON.stringify(d),labels=planHeightLabels(d);assert.equal(labels.walls.length,2);assert.equal(labels.walls[0].label,'H = 2600 мм');assert.equal(labels.walls[1].label,'H = 3000 мм');assert.equal(JSON.stringify(d),before);});
test('missing common height is explicit and individual heights are still identified',()=>{const d=sample();d.height=null;d.walls[0].height=2700;assert.match(planHeightLabels(d).common,/не задана/);assert.equal(planHeightLabels(d).walls[0].label,'H = 2700 мм');d.walls[0].height=NaN;assert.deepEqual(planHeightLabels(d).walls,[]);});
