type Parameter={name:string;value:string};
const normalize=(value:string)=>value.toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ").trim();
const booleanValue=(value:string):boolean|null=>{
  const text=normalize(value);
  if(["да","yes","true","1"].includes(text))return true;
  if(["нет","no","false","0"].includes(text))return false;
  return null;
};

export function catalogFeature(product:{parameters:Parameter[]},feature:"recliner"|"sleeper"|"ottoman"):boolean {
  const fields=new Map(product.parameters.map(item=>[normalize(item.name),item.value]));
  if(feature==="recliner")return booleanValue(fields.get("реклайнер")||"")??false;
  if(feature==="ottoman")return booleanValue(fields.get("наличие оттоманки")||"")??false;
  const explicit=booleanValue(fields.get("спальное место (наличие)")||"");
  if(explicit!==null)return explicit;
  const value=fields.get("спальное место")||"";
  const flag=booleanValue(value);
  if(flag!==null)return flag;
  // A named sleeper mechanism explicitly describes an included sleeping place.
  return Boolean(value.trim()&&!/^(?:-|—|нет данных|не указан[оа]?|неизвестно)$/i.test(value.trim()));
}

export function matchesCatalogFeature(product:{parameters:Parameter[]},feature:"recliner"|"sleeper"|"ottoman",filter:string) {
  return filter!=="yes"&&filter!=="no" || catalogFeature(product,feature)===(filter==="yes");
}
