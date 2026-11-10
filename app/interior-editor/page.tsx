import RoomDesignApp from '../room-design-app';
import {appEntry,type EntrySearch} from '@/lib/app-entry';

export default async function InteriorEditorPage({searchParams}:{searchParams:Promise<EntrySearch>}){
 return <RoomDesignApp {...appEntry(await searchParams,true)}/>;
}
