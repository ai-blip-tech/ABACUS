import {readFile} from 'node:fs/promises';

/** Version-pinned host adaptation for Pascal 1.0.5. Keep upstream package intact.
 * A repeated body click selects; only a held left press may engage dragging.
 */
export function dragOnlyTransform(code){
 const plain='const allowPlainDrag = nodeRegistry.get(node.type)?.capabilities?.movable?.directDrag === true';
 const repeated='const isAlreadySole =\n          selectedIdsBeforeRouting.length === 1 && selectedIdsBeforeRouting[0] === nodeToSelect.id';
 if(!code.includes(plain)||!code.includes(repeated))throw Error('Pascal selection contract changed; review drag-only adaptation');
 return code.replace(plain,"const allowPlainDrag = node.type === 'item' || nodeRegistry.get(node.type)?.capabilities?.movable?.directDrag === true").replace(repeated,'const isAlreadySole = false // Room Design: no click-to-carry mode');
}
/** Remove Pascal's stock overlays; the host owns reference menus and rotation. */
export function cleanStageTransform(code){
 const tags=['FloatingLevelSelector','ActionMenu','PanelManager','FloatingActionMenu','GroupFloatingActionMenu','FloatingBuildingActionMenu','FirstPersonControls'];
 for(const tag of tags){
  const pattern=new RegExp('<'+tag+'\\b[^>]*?\\/>','g');
  if(!pattern.test(code))throw Error('Pascal overlay contract changed: '+tag);
  code=code.replace(pattern,'<></>');
 }
 code=code.replace(/<FirstPersonOverlay\b[\s\S]*?\/>/g,'<></>').replace('{!noEditing && viewerSceneSlot}','{viewerSceneSlot}');
 return code;
}
/** Hide Pascal's extension directory in the Room Design preview. */
export function hidePluginManagerTransform(code) {
 const upstream = "  if (workspaceMode !== 'edit') return false\n  return managedPluginCount > 0 || !readOnly";
 if (!code.includes(upstream)) throw Error('Pascal plugin manager contract changed');
 return code.replace(upstream, '  return false');
}

export default function pascalDragOnly() {
 return {
  name: 'roomdesign-pascal-drag-only',
  enforce: 'pre',
  transform(code, id) {
   const path = id.split('?')[0];
   if (path.endsWith('/lib/plugin-panels.ts')) return {code: hidePluginManagerTransform(code), map: null};
   if (path.endsWith('/components/editor/index.tsx')) return {code: cleanStageTransform(code), map: null};
   if (path.endsWith('/ui/helpers/helper-manager.tsx')) {
    const anchor = 'export function HelperManager() {';
    if (!code.includes(anchor)) throw Error('Pascal helper contract changed');
    return {code: code.replace(anchor, 'export function HelperManager() { return null }\nfunction HiddenHelperManager() {'), map: null};
   }
   if (path.endsWith('/components/editor/selection-manager.tsx')) return {code: dragOnlyTransform(code), map: null};
  },
 };
}

// Vite can bundle the editor before its normal source transforms run.
export function hidePluginManagerPrebundle() {
 return {
  name: 'roomdesign-hide-plugin-manager',
  setup(build) {
   build.onLoad({filter: /[/\\]editor[/\\]src[/\\]lib[/\\]plugin-panels\.ts$/}, async ({path}) => ({
    contents: hidePluginManagerTransform(await readFile(path, 'utf8')),
    loader: 'ts',
   }));
  },
 };
}
