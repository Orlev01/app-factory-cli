const VERCEL_API = "https://api.vercel.com";

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${teamId}` : "";
}

export async function validateToken(
  token: string,
  teamId?: string
): Promise<boolean> {
  const url = teamId
    ? `${VERCEL_API}/v2/teams/${teamId}`
    : `${VERCEL_API}/v2/user`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function createProject(
  token: string,
  name: string,
  githubRepo: string,
  teamId?: string
): Promise<string> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects${teamQuery(teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        framework: "nextjs",
        gitRepository: {
          type: "github",
          repo: githubRepo,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Vercel project: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.id as string;
}

export interface VercelEnvVar {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type: "encrypted" | "plain";
}

export interface VercelEnvVarInfo {
  id: string;
  key: string;
  target: string[];
  type: string;
}

export interface VercelEnvVarDecrypted extends VercelEnvVarInfo {
  value: string;
}

export interface DeploymentInfo {
  id: string;
  url: string;
  state: string;
  created: number;
  meta?: { githubCommitMessage?: string };
}

export async function setEnvVars(
  token: string,
  projectId: string,
  vars: VercelEnvVar[],
  teamId?: string
): Promise<void> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/env${teamQuery(teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(vars),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to set Vercel env vars: ${res.status} ${body}`);
  }
}

export async function deleteProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<void> {
  const res = await fetch(
    `${VERCEL_API}/v9/projects/${projectId}${teamQuery(teamId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete Vercel project: ${res.status} ${body}`);
  }
}

export async function waitForDeployment(
  token: string,
  projectId: string,
  teamId?: string,
  timeoutMs: number = 180_000
): Promise<string> {
  const start = Date.now();
  const pollInterval = 5_000;

  while (Date.now() - start < timeoutMs) {
    const params = new URLSearchParams({ projectId, limit: "1", state: "READY" });
    if (teamId) params.set("teamId", teamId);
    const res = await fetch(
      `${VERCEL_API}/v6/deployments?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.deployments && data.deployments.length > 0) {
        const deployment = data.deployments[0];
        return `https://${deployment.url}`;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Deployment timed out after 3 minutes");
}

function buildUrl(path: string, teamId?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      params.set(k, v);
    }
  }
  const qs = params.toString();
  return `${VERCEL_API}${path}${qs ? `?${qs}` : ""}`;
}

export async function listEnvVars(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelEnvVarInfo[]> {
  const url = buildUrl(`/v9/projects/${projectId}/env`, teamId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list env vars: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.envs as VercelEnvVarInfo[];
}

export async function getEnvVar(
  token: string,
  projectId: string,
  envVarId: string,
  teamId?: string
): Promise<VercelEnvVarDecrypted> {
  const url = buildUrl(`/v9/projects/${projectId}/env/${envVarId}`, teamId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get env var: ${res.status} ${body}`);
  }

  return (await res.json()) as VercelEnvVarDecrypted;
}

export async function updateEnvVar(
  token: string,
  projectId: string,
  envVarId: string,
  value: string,
  target?: string[],
  teamId?: string
): Promise<void> {
  const url = buildUrl(`/v9/projects/${projectId}/env/${envVarId}`, teamId);
  const body: Record<string, unknown> = { value };
  if (target) body.target = target;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update env var: ${res.status} ${text}`);
  }
}

export async function removeEnvVar(
  token: string,
  projectId: string,
  envVarId: string,
  teamId?: string
): Promise<void> {
  const url = buildUrl(`/v9/projects/${projectId}/env/${envVarId}`, teamId);
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to remove env var: ${res.status} ${body}`);
  }
}

export async function getLatestDeployment(
  token: string,
  projectId: string,
  teamId?: string
): Promise<DeploymentInfo | null> {
  const url = buildUrl("/v6/deployments", teamId, { projectId, limit: "1" });
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get deployments: ${res.status} ${body}`);
  }

  const data = await res.json();
  if (!data.deployments || data.deployments.length === 0) return null;

  const d = data.deployments[0];
  return {
    id: d.uid,
    url: d.url,
    state: d.state ?? d.readyState,
    created: d.created,
    meta: d.meta,
  } as DeploymentInfo;
}

export async function triggerRedeploy(
  token: string,
  deploymentId: string,
  name: string,
  teamId?: string
): Promise<string> {
  const url = buildUrl("/v13/deployments", teamId);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      deploymentId,
      meta: { action: "redeploy" },
      target: "production",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to trigger redeploy: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.url as string;
}
