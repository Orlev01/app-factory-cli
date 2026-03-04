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
  githubOrg: string,
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
          repo: `${githubOrg}/${name}`,
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
