import { Vector3 } from 'three';

// Connect triangles along shared edges only when they lie on the same plane.
export function furnitureSurfaces(model) {
 const parts = [];
 model.traverse(mesh => {
  if (!mesh.isMesh) return;
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  mesh.geometry = geometry;
  const positions = geometry.getAttribute('position');
  const count = positions.count / 3;
  const roots = Array.from({length:count}, (_,i) => i);
  const root = i => { while (i !== roots[i]) { roots[i] = roots[roots[i]]; i = roots[i]; } return i; };
  const point = i => new Vector3().fromBufferAttribute(positions, i);
  const pointKey = v => v.toArray().map(n => Math.round(n * 10000)).join(',');
  const edges = new Map();
  for (let i = 0; i < count; i++) {
   const verts = [point(3*i), point(3*i+1), point(3*i+2)];
   const normal = verts[1].clone().sub(verts[0]).cross(verts[2].clone().sub(verts[0])).normalize();
   const plane = normal.dot(verts[0]);
   const keys = verts.map(pointKey);
   for (let j = 0; j < 3; j++) {
    const key = [keys[j], keys[(j+1)%3]].sort().join('|');
    const incident = edges.get(key) ?? [];
    for (const face of incident) {
     if (normal.dot(face.normal) > .99999 && Math.abs(plane - face.plane) < .0002) roots[root(i)] = root(face.i);
    }
    incident.push({i,normal,plane});
    edges.set(key,incident);
   }
  }
  const part = parts.length;
  const faceIds = roots.map((_,i) => `${part}:${root(i)}`);
  const base = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const original = Array(count).fill(0);
  for (const group of geometry.groups) original.fill(group.materialIndex,group.start/3,(group.start+group.count)/3);
  // The TETRA archive already includes UV coordinates. Provide planar UVs on unwrapped meshes.
  if (!geometry.getAttribute('uv')) {
   const uv = new Float32Array(positions.count * 2);
   for (let i = 0; i < count; i++) {
    const [a,b,c] = [point(3*i), point(3*i+1), point(3*i+2)];
    const n = b.sub(a).cross(c.sub(a)).toArray().map(Math.abs);
    const axes = [0,1,2].filter(axis => axis !== n.indexOf(Math.max(...n)));
    for (let j = 0; j < 3; j++) {
     const v = point(3*i+j).toArray();
     uv.set([v[axes[0]],v[axes[1]]],(3*i+j)*2);
    }
   }
   geometry.setAttribute('uv',new positions.constructor(uv,2));
  }
  parts.push({mesh,faceIds,base,original});
 });
 return parts;
}

export function updateFurnitureSurfaces(parts, assignments, selected, highlight) {
 for (const {mesh,faceIds,base,original} of parts) {
  const materials = [...base];
  const indices = new Map(materials.map((mat,i) => [mat,i]));
  const materialIndex = (id,i) => {
   const material = (id === selected && highlight) || assignments[id] || (selected === 'all' && highlight);
   if (!material) return original[i];
   if (!indices.has(material)) indices.set(material,materials.push(material)-1);
   return indices.get(material);
  };
  mesh.geometry.clearGroups();
  let start=0,previous=materialIndex(faceIds[0],0);
  for (let i=1;i<=faceIds.length;i++) {
   const current=i<faceIds.length ? materialIndex(faceIds[i],i) : -1;
   if (current===previous) continue;
   mesh.geometry.addGroup(start*3,(i-start)*3,previous);
   start=i;
   previous=current;
  }
  mesh.material=materials;
 }
}
