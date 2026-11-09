import {emptyBoard,isBoard,type MaterialBoard} from './model.ts';
export type MaterialSheet={id:string;name:string;board:MaterialBoard};
export type MaterialWorkbook={version:2;activeSheetId:string;sheets:MaterialSheet[]};
export function isWorkbook(value:unknown):value is MaterialWorkbook{
 if(!value||typeof value!=='object')return false;const b=value as MaterialWorkbook;
 return b.version===2&&typeof b.activeSheetId==='string'&&Array.isArray(b.sheets)&&b.sheets.length>0&&new Set(b.sheets.map(s=>s?.id)).size===b.sheets.length&&b.sheets.every(s=>s&&typeof s.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(s.id)&&typeof s.name==='string'&&s.name.trim().length>0&&s.name.length<=80&&isBoard(s.board))&&b.sheets.some(s=>s.id===b.activeSheetId);
}
export function asWorkbook(value:unknown):MaterialWorkbook|null{
 if(isWorkbook(value))return value;
 return isBoard(value)?{version:2,activeSheetId:'sheet-1',sheets:[{id:'sheet-1',name:'Лист 1',board:value}]}:null;
}
export const activeSheet=(book:MaterialWorkbook)=>book.sheets.find(s=>s.id===book.activeSheetId)!;
export function withActiveBoard(book:MaterialWorkbook,board:MaterialBoard):MaterialWorkbook{return{...book,sheets:book.sheets.map(s=>s.id===book.activeSheetId?{...s,board}:s)};}
export function appendSheet(book:MaterialWorkbook,id:string):MaterialWorkbook{
 if(book.sheets.some(s=>s.id===id))throw Error('Лист с таким идентификатором уже существует.');
 const sheet={id,name:`Лист ${book.sheets.length+1}`,board:{...emptyBoard(),furniturePosition:{x:75,y:140}}};
 return{...book,activeSheetId:id,sheets:[...book.sheets,sheet]};
}
export function renameSheet(book:MaterialWorkbook,id:string,name:string):MaterialWorkbook{
 const trimmed=name.trim().slice(0,80);if(!trimmed)return book;
 return{...book,sheets:book.sheets.map(s=>s.id===id?{...s,name:trimmed}:s)};
}
