import {database} from '../server-runtime.ts';

export function ensureMaterialsStore(){
 database.prepare('CREATE TABLE IF NOT EXISTS material_boards(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision INTEGER NOT NULL,document_json TEXT NOT NULL,updated_at TEXT NOT NULL)').execute();
 database.prepare('CREATE TABLE IF NOT EXISTS material_board_assets(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,asset TEXT NOT NULL,PRIMARY KEY(project_id,asset))').execute();
}
