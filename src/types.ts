export interface AppFactoryConfig {
  githubToken: string;
  githubOrg: string;
  githubSshHost: string;
  templateRepo: string;
  appsDirectory: string;
  neonApiKey: string;
  vercelToken: string;
  resendApiKey: string;
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
