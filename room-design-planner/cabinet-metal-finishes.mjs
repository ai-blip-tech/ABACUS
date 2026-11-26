// Sonorous 2026, printed page 105. Use the catalog swatches for both preview and material.
export const DEFAULT_CABINET_METAL = 'DBGT';
export const cabinetMetalFinishes = [
 ['WHTT','White'], ['OYST','Oyster white'], ['BLKT','Black'], ['BLKJ','Jet black'],
 ['TLRT','Timeless rust'], ['DBGT','DB grey'], ['QGTT','Quartz glint'], ['GDST','Grained stone'],
 ['EMPT','Emperador'], ['BGRT','Beige grey'], ['AGRT','Anthracite grey'], ['CGRT','Cement grey'],
 ['ABRT','Antique bronze'], ['CSHT','Cashmere'], ['CBRT','Copper brown'],
 ['SGR','Storm grey'], ['CON','Concrete'], ['SLV','Silver'], ['SBG','Soft beige'],
 ['SBA','Sabbia'], ['PNA','Panna'], ['BRD','Bordeaux'], ['GRA','Grigio argento'],
 ['GRC','Grigio chiaro'], ['ABR','Antique bronze'], ['BRZ','Bronze'], ['GLD','Gold'],
];

export function cabinetMetalFinishId(id) {
 return cabinetMetalFinishes.some(([code])=>code===id)?id:DEFAULT_CABINET_METAL;
}
