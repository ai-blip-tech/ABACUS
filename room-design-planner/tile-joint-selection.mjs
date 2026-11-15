import {tileDragGroup} from './tile-drag.mjs';
import {reflowTiledGroups} from './tile-wall-fill.mjs';
export function selectedTileStyle(all,id,fallback={joint:.002,grout:'#c7c1b3'}){const p=all.find(p=>p.id===id);return p?{joint:p.joint,grout:p.grout}:fallback;}
export function changeSelectedTileJoints(all,id,mode,style,L,H,holes=[]){const selected=all.find(p=>p.id===id);if(!selected)return all;const group=tileDragGroup(selected,all,mode),ids=new Set(group.map(p=>p.id));const changed=mode!=='tile'&&selected.grid?reflowTiledGroups(group,L,H,style,holes).pieces:group.map(p=>({...p,...style}));return [...all.filter(p=>!ids.has(p.id)),...changed];}
