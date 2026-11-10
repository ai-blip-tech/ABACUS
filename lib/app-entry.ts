export type AppView='home'|'account'|'newProject'|'projectMenu'|'studio';
export type EntrySearch=Record<string,string|string[]|undefined>;
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
/** Select the correct first server render; project/editor entries never render landing media. */
export function appEntry(search:EntrySearch,editor=false):{initialView:AppView;initialProjectId:string}{
 const project=first(search.project)?.trim()||'';
 const studio=editor||first(search.embeddedStage)==='1'||['image','plan'].includes(first(search.studioMode)||'')||first(search.studioPreview)==='legacy';
 return{initialView:studio?'studio':project?'projectMenu':'home',initialProjectId:project};
}
