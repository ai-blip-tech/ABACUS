import test from 'node:test';
import assert from 'node:assert/strict';
import {canUsePlanCamera} from '../lib/measured-plan/measure-upload.ts';
test('PC and trackpad do not offer photo capture, including narrow desktop windows and touchscreen Windows',()=>{assert.equal(canUsePlanCamera(false,0,'Macintosh','MacIntel'),false);assert.equal(canUsePlanCamera(false,5,'Windows NT'),false);assert.equal(canUsePlanCamera(true,10,'Windows NT'),false);});
test('touch phone or tablet offers camera capture, including desktop UA iPadOS',()=>{assert.equal(canUsePlanCamera(true,1,'iPhone'),true);assert.equal(canUsePlanCamera(true,5,'Android'),true);assert.equal(canUsePlanCamera(true,5,'Macintosh','MacIntel'),true);});
test('coarse pointer or mobile UA without touch is not sufficient to expose camera',()=>{assert.equal(canUsePlanCamera(true,0,'Android'),false);assert.equal(canUsePlanCamera(true,0,'Linux'),false);});
