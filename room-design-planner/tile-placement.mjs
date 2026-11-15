import {pieceSize} from './tile-products.mjs';
export function tileAtPoint(config,point,L,H){const [w,h]=pieceSize(config);return {...config,x:Math.max(0,Math.min(Math.max(0,L-w),point[0]-w/2)),y:Math.max(0,Math.min(Math.max(0,H-h),point[1]-h/2))};}
