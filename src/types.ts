export interface AppFactoryConfig {
  neonApiKey: string;
  vercelToken: string;
  resendApiKey: string;
  githubOrg: string;
  templateRepo: string;
  appsDirectory: string;
  emailFrom: string;
  vercelTeamId?: string;
}

export interface AppRecord {
  name: string;
  url: string;
  githubRepo: string;
  neonProjectId: string;
  vercelProjectId: string;
  localPath: string;
  createdAt: string;
}

export interface AppsRegistry {
  apps: AppRecord[];
}

export interface CreateOptions {
  name: string;
  config: AppFactoryConfig;
}
