import type {MeasureDoc} from '../measured-plan/measure-model';
/** Door/window changes can be rebased without replacing local finishes or coverings. */
export function sameWallGeometry(a:MeasureDoc,b:MeasureDoc){const key=(p:MeasureDoc)=>JSON.stringify([p.id,p.walls.map(w=>[w.id,w.a,w.b,w.thickness,w.height]),p.columns||[],p.floor]);return key(a)===key(b);}
export function syncOpenings(local:MeasureDoc,source:MeasureDoc):MeasureDoc{if(!sameWallGeometry(local,source)||JSON.stringify(local.openings)===JSON.stringify(source.openings))return local;return {...local,openings:structuredClone(source.openings)};}
