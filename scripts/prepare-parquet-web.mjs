import sharp from 'sharp';
import {mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2];if(!root)throw Error('Specify the parquet asset directory');
await mkdir(path.join(root,'preview'),{recursive:true});
let count=0;for(const id of await readdir(path.join(root,'PBR'))){if(!/^WoodFloor\d{3}$/.test(id))continue;const files=await readdir(path.join(root,'PBR',id)),name=files.find(name=>name.endsWith('_Color.jpg'));if(!name)throw Error('Missing color map: '+id);await sharp(path.join(root,'PBR',id,name)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).jpeg({quality:88,progressive:true}).toFile(path.join(root,'preview',id+'.jpg'));count++;}if(count!==20)throw Error('Expected 20 parquet materials');console.log('PARQUET_WEB_PREVIEWS='+count);
