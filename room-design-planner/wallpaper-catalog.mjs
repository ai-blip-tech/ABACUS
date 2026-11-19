export const wallpapers=[];
export const wallpaperById=id=>wallpapers.find(p=>p.id===id);
export function wallpaperUV(x,y,surface){const scale=Math.max(.1,Number(surface.scale)||1),angle=(surface.angle||0)*Math.PI/180;x-=surface.origin?.[0]||0;y-=surface.origin?.[1]||0;return [(x*Math.cos(angle)-y*Math.sin(angle))/scale,(x*Math.sin(angle)+y*Math.cos(angle))/scale];}
