import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "./config.js";
import type { AppRecord, AppsRegistry } from "../types.js";

function getRegistryPath(): string {
  return path.join(getConfigDir(), "apps.json");
}

export function readRegistry(): AppsRegistry {
  const registryPath = getRegistryPath();
  if (!fs.existsSync(registryPath)) {
    return { apps: [] };
  }
  const raw = fs.readFileSync(registryPath, "utf-8");
  return JSON.parse(raw) as AppsRegistry;
}

export function writeRegistry(registry: AppsRegistry): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(
    getRegistryPath(),
    JSON.stringify(registry, null, 2) + "\n"
  );
}

export function addApp(app: AppRecord): void {
  const registry = readRegistry();
  registry.apps.push(app);
  writeRegistry(registry);
}

export function removeApp(name: string): void {
  const registry = readRegistry();
  registry.apps = registry.apps.filter((a) => a.name !== name);
  writeRegistry(registry);
}

export function findApp(name: string): AppRecord | undefined {
  const registry = readRegistry();
  return registry.apps.find((a) => a.name === name);
}
