import test from 'node:test';import assert from 'node:assert/strict';
import {catalogModelPreviewStatus} from '../lib/catalog-model3d.ts';
test('supplier archive does not claim to be a ready 3D model',()=>{assert.deepEqual(catalogModelPreviewStatus({id:'leve-home:334625_283',model3dUrl:'https://levehome.ru/model.rar'}),{ready:false,label:'3D · требуется конвертация'});});
test('generic GLB still needs validation; demo samples do not mark products as ready',()=>{assert.equal(catalogModelPreviewStatus({id:'other',model3dUrl:'https://example.com/model.glb'}).ready,false);assert.equal(catalogModelPreviewStatus({id:'leve-home:334625_1023'}).ready,false);assert.equal(catalogModelPreviewStatus({hasModel3D:true}).label,'3D · ожидаем ссылку');});
