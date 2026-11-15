export type EditorKeyCommand='delete'|'clear'|'copy'|'paste'|'cut'|'undo'|'redo';
export function editorKeyCommand(event:{key:string;code?:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;repeat?:boolean}):EditorKeyCommand|null{
 if(event.altKey)return null;
 const modifier=event.ctrlKey||event.metaKey;
 if(!modifier){if(event.key==='Delete'||event.key==='Backspace')return 'delete';if(event.key==='Escape')return 'clear';return null;}
 const key=event.code?.startsWith('Key')?event.code.slice(3).toLowerCase():event.key.toLowerCase();
 if(key==='z')return event.shiftKey?'redo':'undo';if(key==='y')return 'redo';
 if(event.repeat)return null;
 return key==='c'?'copy':key==='v'?'paste':key==='x'?'cut':null;
}
