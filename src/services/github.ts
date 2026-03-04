import { execFileSync, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function checkAuthStatus(): boolean {
  try {
    run("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}

export function repoExists(org: string, name: string): boolean {
  try {
    run("gh", ["repo", "view", `${org}/${name}`, "--json", "name"]);
    return true;
  } catch {
    return false;
  }
}

export function createRepo(org: string, name: string): void {
  run("gh", ["repo", "create", `${org}/${name}`, "--private"]);
}

export function pushInitialCommit(appDir: string, org: string, name: string): void {
  run("git", ["add", "-A"], appDir);
  run("git", ["commit", "-m", "Initial commit from appfactory"], appDir);
  run("git", ["remote", "add", "origin", `https://github.com/${org}/${name}.git`], appDir);
  run("git", ["push", "-u", "origin", "main"], appDir);
}

export function deleteRepo(org: string, name: string): void {
  run("gh", ["repo", "delete", `${org}/${name}`, "--yes"]);
}

export async function getRepoInfo(
  org: string,
  name: string
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
      { encoding: "utf-8" }
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
