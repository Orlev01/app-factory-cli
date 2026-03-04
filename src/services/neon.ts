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
  const projectId: string = data.project.id;
  const connectionUri: string = data.connection_uris[0].connection_uri;

  return { projectId, connectionUri };
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
