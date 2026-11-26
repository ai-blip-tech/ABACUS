import type {CabinetCatalog,CabinetConfig} from './modular-cabinets';
import {cabinetFrontFinish,glassCabinetArticle,isFixedCabinetFront} from './cabinet-front-finishes.mjs';

type Finish = {material: string; article?: string};
type ModuleFinish = Finish & {surface: string};

export type CabinetSpecification = {
  scope: string;
  fingerprint: string;
  createdAt: number;
  name: string;
  size: {width: number; height: number; depth: number};
  modules: {article: string; type: string; size: CabinetSpecification['size']; finishes?: ModuleFinish[]}[];
  support?: string;
  price: string;
  priceInCents?: number;
  priceNote?: string;
  photos: {front: Blob; view: Blob};
};

type StoredPhoto = {bytes: ArrayBuffer; type: string};
type StoredCabinetSpecification = Omit<CabinetSpecification, 'photos'> & {
  photos: {front: StoredPhoto | Blob; view: StoredPhoto | Blob};
};

function restorePhoto(photo: StoredPhoto | Blob): Blob {
  return photo instanceof Blob ? photo : new Blob([photo.bytes], {type:photo.type});
}

function groupFinishes<T>(parts: {part: T; finish: Finish}[], label: (parts: T[]) => string): ModuleFinish[] {
  const groups = new Map<string,{finish: Finish; parts: T[]}>();
  for (const {part,finish} of parts) {
    const key = JSON.stringify([finish.material,finish.article]);
    const group = groups.get(key);
    if (group) group.parts.push(part);
    else groups.set(key,{finish,parts:[part]});
  }
  return Array.from(groups.values(),({finish,parts})=>({...finish,surface:label(parts)}));
}

export function cabinetSpecificationFinishes(config: CabinetConfig,catalog: CabinetCatalog): ModuleFinish[][] {
  const samples = new Map(catalog.samples.map(sample=>[sample.id,sample]));
  const describe = (selection: {type: string; sample?: string; finish?: string}): Finish => {
    const sample = selection.sample ? samples.get(selection.sample) : undefined;
    if (selection.type==='ceramic') {
      const [name,article] = sample?.label.split(' · ') || [];
      return {material:name?'Керамогранит · '+name:'Керамогранит',article};
    }
    const matte = selection.finish==='matte';
    const color = sample?.id || (/^[A-Z]{3}$/.test(selection.sample||'')?selection.sample:undefined);
    return {
      material:(matte?'Матовое стекло':'Глянцевое стекло')+(sample?' · '+sample.label:''),
      article:color ? glassCabinetArticle(color,selection.finish) : undefined,
    };
  };
  return config.modules.map(module=>{
    const model = catalog.models.find(entry=>entry.id===module.model);
    const body = {sample:module.glass,finish:module.finish};
    const bodyFinishes = groupFinishes([
      {part:'Корпус',glass:body},
      {part:'Столешница',glass:config.top||body},
      {part:'Левая боковина',glass:module.surfaces?.left||body},
      {part:'Правая боковина',glass:module.surfaces?.right||body},
    ].map(({part,glass})=>({part,finish:describe({type:'glass',...glass})})),
    parts=>parts.length===4?'Корпус и столешница':parts.join(', '));
    const fronts = model?.fronts || [];
    const frontFinishes = !model?[]:groupFinishes(fronts.map((_,index)=>({
      part:index+1,
      finish:isFixedCabinetFront(model,index)
        ?{material:model.fixedFront==='transparent-glass'?'Прозрачное стекло, заводская отделка':'Заводская отделка'}
        :describe(cabinetFrontFinish(config,module,index)),
    })),parts=>parts.length===fronts.length
      ?(parts.length===1?'Фасад':'Все фасады')
      :(parts.length===1?'Фасад ':'Фасады ')+parts.join(', '));
    return [...bodyFinishes,...frontFinishes];
  });
}

export function restoreCabinetSpecificationFinishes(item: CabinetSpecification,catalog: CabinetCatalog): CabinetSpecification {
  if (item.modules.every(module=>module.finishes)) return item;
  try {
    const config: CabinetConfig = JSON.parse(item.fingerprint);
    if (config.modules.length!==item.modules.length||
      config.modules.some((module,index)=>module.model!==item.modules[index].article)) return item;
    const finishes = cabinetSpecificationFinishes(config,catalog);
    return {...item,modules:item.modules.map((module,index)=>({...module,finishes:module.finishes||finishes[index]}))};
  } catch {
    return item;
  }
}

export function cabinetFingerprint(config: CabinetConfig) {
  return JSON.stringify(config, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left],[right])=>left.localeCompare(right)));
  });
}

function openSpecificationStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('room-design-cabinet-specification', 1);
    request.onupgradeneeded = () => {
      const items = request.result.createObjectStore('items', {keyPath: ['scope','fingerprint']});
      items.createIndex('scope','scope');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCabinetSpecification(scope: string): Promise<CabinetSpecification[]> {
  const db = await openSpecificationStore();
  try {
    const entries = await new Promise<StoredCabinetSpecification[]>((resolve, reject) => {
      const request = db.transaction('items').objectStore('items').index('scope').getAll(scope);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return entries.sort((left, right) => left.createdAt - right.createdAt).map(item => ({
      ...item, photos:{front:restorePhoto(item.photos.front),view:restorePhoto(item.photos.view)},
    }));
  } finally {
    db.close();
  }
}

async function updateSpecificationStore(update: (items: IDBObjectStore) => void) {
  const db = await openSpecificationStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('items','readwrite');
      update(transaction.objectStore('items'));
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function saveCabinetSpecification(item: CabinetSpecification) {
  // Store photo bytes because WebKit can reject Blob writes to IndexedDB.
  const [front, view] = await Promise.all([item.photos.front,item.photos.view].map(async photo => ({
    bytes:await photo.arrayBuffer(),type:photo.type,
  })));
  return updateSpecificationStore(items => items.put({...item,photos:{front,view}}));
}

export function removeCabinetSpecification(scope: string, fingerprint: string) {
  return updateSpecificationStore(items => items.delete([scope, fingerprint]));
}
