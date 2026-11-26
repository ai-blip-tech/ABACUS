import {join,resolve} from 'node:path';

export function cabinetLibraryRoot(dataDirectory = process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR || 'data') {
 return join(resolve(dataDirectory),'storage','cabinet-library','versions');
}
