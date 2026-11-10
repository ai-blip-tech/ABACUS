import test from 'node:test';
import assert from 'node:assert/strict';
import {appEntry} from '../lib/app-entry.ts';
import {projectStages,projectStageFrameUrl} from '../lib/project-stage-routing.ts';
test('all working stages enter their own route, never the homepage',()=>{
 const expected={sources:'/measured-plan',installation:'/partition-plan',planning:'/planning-plan',materials:'/materials-concept',interior:'/interior-editor',lighting:'/technical-lighting'};
 for(const [id,path] of Object.entries(expected)){
  const url=new URL(projectStageFrameUrl(id,'real-project'),'https://roomdesign.test');assert.equal(url.pathname,path);assert.equal(url.searchParams.get('project'),'real-project');assert.equal(url.searchParams.get('embeddedStage'),'1');assert.notEqual(url.pathname,'/');assert.equal(url.hash,'');
 }
 for(const stage of projectStages.filter(s=>!s.path))assert.equal(projectStageFrameUrl(stage.id,'real-project'),null);
});
test('saved projects render the workspace directly for every selected stage',()=>{
 for(const stage of projectStages)assert.deepEqual(appEntry({project:'real-project',stage:stage.id}),{initialView:'projectMenu',initialProjectId:'real-project'});
});
test('the dedicated editor and existing studio deep links render studio directly',()=>{
 assert.deepEqual(appEntry({project:'real-project'},true),{initialView:'studio',initialProjectId:'real-project'});
 assert.equal(appEntry({},true).initialView,'studio');
 for(const studioMode of ['image','plan'])assert.equal(appEntry({project:'real-project',studioMode}).initialView,'studio');
 assert.equal(appEntry({project:'real-project',embeddedStage:'1'}).initialView,'studio');
 assert.equal(appEntry({}).initialView,'home');
});
