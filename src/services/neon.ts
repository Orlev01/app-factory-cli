export interface NeonProject {
  projectId: string;
  connectionUri: string;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  const res = await fetch("https://console.neon.tech/api/v2/projects?limit=1", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}

export async function createProject(
  apiKey: string,
  name: string
): Promise<NeonProject> {
  const res = await fetch("https://console.neon.tech/api/v2/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project: { name },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create Neon project: ${res.status} ${body}`);
  }

  const data = await res.json();
  const projectId: string = data.project?.id;
  if (!projectId) {
    throw new Error("Neon API response missing project ID");
  }

  const connectionUri: string = data.connection_uris?.[0]?.connection_uri;
  if (!connectionUri) {
    throw new Error("Neon API response missing connection URI");
  }

  return { projectId, connectionUri };
}

export async function getProjectStatus(
  apiKey: string,
  projectId: string
): Promise<{ active: boolean; name: string; region: string; createdAt: string }> {
  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get Neon project status: ${res.status} ${body}`);
  }

  const data = await res.json();
  const project = data.project;
  return {
    active: project.current_state === "active" || project.current_state === "idle",
    name: project.name,
    region: project.region_id,
    createdAt: project.created_at,
  };
}

export async function deleteProject(
  apiKey: string,
  projectId: string
): Promise<void> {
  const res = await fetch(
    `https://console.neon.tech/api/v2/projects/${projectId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete Neon project: ${res.status} ${body}`);
  }
}
