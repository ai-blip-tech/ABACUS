import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionLabelLayout} from '../lib/measured-plan/print-dimension-label.ts';
test('vertical 6218 is centered along the line with its baseline entirely left of it',()=>{const r=dimensionLabelLayout({x:100,y:0},{x:100,y:200},16);assert.equal(r.angle,90);assert.equal(r.x,97);assert.equal(r.y,92);});
test('horizontal text is above the line, centered rather than starting at its midpoint',()=>{assert.deepEqual(dimensionLabelLayout({x:0,y:100},{x:200,y:100},16),{x:92,y:103,angle:0});});
test('label shifts along its dimension to avoid a crossing partition without changing its value',()=>{const r=dimensionLabelLayout({x:0,y:100},{x:200,y:100},16,3,[{left:95,right:105,bottom:90,top:120}]);assert.ok(r.x+16<95||r.x>105);assert.equal(r.y,103);});
test('diagonal and reversed lines retain a perpendicular gap and readable angle',()=>{for(const angle of [-170,-120,-90,-45,0,45,90,120,170]){const t=angle*Math.PI/180,a={x:10,y:20},b={x:10+200*Math.cos(t),y:20+200*Math.sin(t)},r=dimensionLabelLayout(a,b,16);assert.ok(r.angle>=-90&&r.angle<=90);const u=r.angle*Math.PI/180,dx=r.x+8*Math.cos(u)-(a.x+b.x)/2,dy=r.y+8*Math.sin(u)-(a.y+b.y)/2;assert.ok(Math.abs(dx*(-Math.sin(u))+dy*Math.cos(u)-3)<1e-8);}});
