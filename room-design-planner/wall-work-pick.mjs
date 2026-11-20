/** Pick the editable face, including its door/window cut-outs. This selects the
 * host wall only; the actual finish geometry still excludes every opening. */
export function wallWorkPlaneHit(origin, direction, wall, part) {
  const dz=direction[2];
  if (!part || Math.abs(dz)<1e-9) return null;
  const z=part.side*wall.thickness/2, t=(z-origin[2])/dz;
  if (t<0) return null;
  const x=origin[0]+direction[0]*t, y=origin[1]+direction[1]*t;
  const from=part.from/1000,to=part.to/1000;
  if (x<from-1e-5 || x>to+1e-5 || y<0 || y>wall.height) return null;
  return [Math.max(from,Math.min(to,x)),y,z];
}
