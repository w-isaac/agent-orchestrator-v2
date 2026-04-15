import Database from 'better-sqlite3';

export interface V1Project {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  github_repo?: string;
  status?: string;
  settings?: string;
  created_at?: string;
  updated_at?: string;
}

export interface V1Story {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  priority?: string;
  epic?: string;
  status: string;
  github_issue_number?: number;
  complexity?: string;
  created_at?: string;
  updated_at?: string;
}

export interface V1AgentRun {
  id: string;
  story_id: string;
  project_id: string;
  agent_role?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  claude_model?: string;
  pr_url?: string;
  commit_sha?: string;
  branch_name?: string;
}

export interface V1Stage {
  id: string;
  [key: string]: unknown;
}

export class SqliteReader {
  private db: Database.Database;

  constructor(sqlitePath: string) {
    this.db = new Database(sqlitePath, { readonly: true });
  }

  readProjects(): V1Project[] {
    return this.db.prepare('SELECT * FROM projects').all() as V1Project[];
  }

  readStories(): V1Story[] {
    return this.db.prepare('SELECT * FROM stories').all() as V1Story[];
  }

  readAgentRuns(): V1AgentRun[] {
    return this.db.prepare('SELECT * FROM agent_runs').all() as V1AgentRun[];
  }

  readStages(): V1Stage[] {
    try {
      return this.db.prepare('SELECT * FROM pipeline_stages').all() as V1Stage[];
    } catch {
      return [];
    }
  }

  close(): void {
    this.db.close();
  }
}
