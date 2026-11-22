// Production server installs only root dependencies. Keep its tests honest even
// on developer machines that also have the browser planner dependencies installed.
export function resolve(specifier,context,nextResolve){
 // Node tests run on the server; Next enforces this import boundary in builds.
 if(specifier==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
 if(specifier==='three'||specifier.startsWith('three/')||specifier.startsWith('@react-three/'))throw Error('Browser 3D dependency reached a server test: '+specifier+'. Keep pure layout maths separate from rendering and run mesh tests in room-design-planner/tests.');
 return nextResolve(specifier,context);
}
