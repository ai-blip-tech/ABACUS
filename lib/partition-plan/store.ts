import {database} from '../server-runtime';
export function ensurePartitionStore(){database.transaction(db=>db.exec(`CREATE TABLE IF NOT EXISTS partition_plans(project_id TEXT NOT NULL,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision INTEGER NOT NULL,document_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(project_id,user_id,tenant_id))`));}
