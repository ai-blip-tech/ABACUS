const projectAssetPattern = /^\/api\/projects\/[^/]+\/assets\/[^/?#]+(?:[?#].*)?$/;

export async function normalizePlanReferenceImages(
  sources: string[],
  loadProjectAsset: (source: string) => Promise<string>,
) {
  return Promise.all(sources.map((source) => {
    if (source.startsWith("data:") || !projectAssetPattern.test(source)) return source;
    return loadProjectAsset(source);
  }));
}
