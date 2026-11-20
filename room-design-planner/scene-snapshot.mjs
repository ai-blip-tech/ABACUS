/** Clone the editable scene and retain product definitions used by tile regions. */
export function snapshotScene(state, products) {
 const scene = structuredClone({nodes:state.nodes,rootNodeIds:state.rootNodeIds});
 for (const node of Object.values(scene.nodes)) {
  if (node.type !== 'wall') continue;
  const metadata = node.metadata ||= {};
  const regions = Object.values(metadata.roomDesignTileRegions || {});
  const pieces = [...(metadata.roomDesignTiles || []), ...regions,
   ...regions.flatMap(region => region.displacedTiles || []), metadata.roomDesignTileSettings];
  const ids = new Set(pieces.filter(Boolean).map(piece => piece.productId));
  const used = products.filter(product => ids.has(product.id));
  if (used.length) metadata.roomDesignTileProducts = structuredClone(used);
  else delete metadata.roomDesignTileProducts;
 }
 return scene;
}
