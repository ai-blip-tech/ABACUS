let context={projectId:null,sheetId:null};
export const setDecaroContext=value=>{context={projectId:value.projectId||null,sheetId:value.sheetId||null};};
export const getDecaroContext=()=>context;
