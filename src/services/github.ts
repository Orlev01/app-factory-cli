import { execFileSync, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

function run(
  cmd: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> }
): string {
  return execFileSync(cmd, args, {
    cwd: options?.cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: options?.env ? { ...process.env, ...options.env } : undefined,
  }).trim();
}

function ghEnv(token: string): Record<string, string> {
  return { GH_TOKEN: token };
}

export function checkGhInstalled(): boolean {
  try {
    run("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function validateToken(token: string): Promise<{ valid: boolean; login: string }> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { valid: false, login: "" };
    const data = (await res.json()) as { login: string };
    return { valid: true, login: data.login };
  } catch {
    return { valid: false, login: "" };
  }
}

export function repoExists(org: string, name: string, token: string): boolean {
  try {
    run("gh", ["repo", "view", `${org}/${name}`, "--json", "name"], {
      env: ghEnv(token),
    });
    return true;
  } catch {
    return false;
  }
}

export function createRepo(org: string, name: string, token: string): void {
  run("gh", ["repo", "create", `${org}/${name}`, "--private"], {
    env: ghEnv(token),
  });
}

export function pushInitialCommit(
  appDir: string,
  org: string,
  name: string,
  sshHost: string
): void {
  run("git", ["add", "-A"], { cwd: appDir });
  run("git", ["commit", "-m", "Initial commit from appfactory"], { cwd: appDir });
  run("git", ["remote", "add", "origin", `git@${sshHost}:${org}/${name}.git`], {
    cwd: appDir,
  });
  run("git", ["push", "-u", "origin", "main"], { cwd: appDir });
}

export function deleteRepo(org: string, name: string, token: string): void {
  run("gh", ["repo", "delete", `${org}/${name}`, "--yes"], {
    env: ghEnv(token),
  });
}

export async function getRepoInfo(
  org: string,
  name: string,
  token: string
): Promise<{
  exists: boolean;
  private: boolean;
  defaultBranch: string;
  pushedAt: string;
  openPRs: number;
}> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["repo", "view", `${org}/${name}`, "--json", "name,isPrivate,defaultBranchRef,pushedAt,pullRequests"],
      {
        encoding: "utf-8",
        env: { ...process.env, GH_TOKEN: token },
      }
    );
    const data = JSON.parse(stdout.trim());
    const openPRs = Array.isArray(data.pullRequests)
      ? data.pullRequests.filter((pr: { state: string }) => pr.state === "OPEN").length
      : 0;
    return {
      exists: true,
      private: data.isPrivate,
      defaultBranch: data.defaultBranchRef?.name ?? "main",
      pushedAt: data.pushedAt,
      openPRs,
    };
  } catch {
    return {
      exists: false,
      private: false,
      defaultBranch: "",
      pushedAt: "",
      openPRs: 0,
    };
  }
}
