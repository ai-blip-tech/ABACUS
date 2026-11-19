import catalog from '../public/experimental-wallpapers/catalog.json';
export type WallpaperCatalogItem={id:string;name:string;image:string;base?:string;tint?:string|null};
export default catalog as WallpaperCatalogItem[];
