import type {Point} from '../measured-plan/measure-model';
export type CadSymbol={version:1;blockName:string;instance:string;classification:'name'|'review'|'unknown';paths:{points:Point[];fill?:string}[]};
export function validateCadSymbol(value:unknown):asserts value is CadSymbol{
 const c=value as CadSymbol;if(!c||c.version!==1||typeof c.blockName!=='string'||c.blockName.length>240||typeof c.instance!=='string'||c.instance.length>140||!['name','review','unknown'].includes(c.classification)||!Array.isArray(c.paths)||c.paths.length>1000)throw Error('Некорректный векторный блок CAD');let count=0;
 for(const p of c.paths){if(!Array.isArray(p.points)||p.points.length<2||p.points.length>4000||(p.fill!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.fill)))throw Error('Некорректный контур CAD');for(const point of p.points)if(!Array.isArray(point)||point.length!==2||!point.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=.500001))throw Error('Некорректные координаты блока CAD');count+=p.points.length;}if(count>15000)throw Error('Слишком сложный блок CAD');
}
