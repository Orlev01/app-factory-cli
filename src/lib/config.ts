import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AppFactoryConfig } from "../types.js";

const CONFIG_DIR = path.join(os.homedir(), ".appfactory");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function readConfig(): AppFactoryConfig {
  if (!configExists()) {
    throw new Error(
      "Config not found. Run `appfactory init` first to set up your credentials."
    );
  }
  const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as AppFactoryConfig;
}

export function writeConfig(config: AppFactoryConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}
