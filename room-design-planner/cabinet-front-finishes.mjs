export function cabinetFrontFinish(configuration,module,index) {
 return module.frontFinishes?.[index] || (configuration.frontType==='glass'
  ?{type:'glass',...configuration.frontGlass}
  :{type:'ceramic',sample:configuration.front});
}

export function isFixedCabinetFront(model,index) {
 return model.fixedFront==='transparent-glass'||model.fronts?.[index]?.every(price=>price===null)===true;
}

// The Sonorous glass palette (printed page 104) adds C to the matte article.
export function glassCabinetArticle(color,finish) {
 return finish==='matte'?color+'C':color;
}

export function ceramicCabinetPriceGroup(code) {
 if(code==='ANT')return 2;
 if(['OUTB','CRBN','ALGT','CP03','CHMB','STGC','STGA','STGCR','TPM','CFL','CFD','CGOLD','ELA','LOOS','RDRC','BCAP','NMTS','MYMS'].includes(code))return 3;
 if(['NMTM','SMC','VAM','DCR','RDRCM','MLS','RDRP'].includes(code))return 4;
 return undefined;
}
