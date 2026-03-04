#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { destroyCommand } from "./commands/destroy.js";

const program = new Command();

program
  .name("appfactory")
  .description("Provision full-stack apps from a template in one command")
  .version("1.0.0");

program
  .command("init")
  .description("Configure credentials and settings")
  .action(initCommand);

program
  .command("create")
  .description("Create a new app from the template")
  .argument("[name]", "App name (kebab-case, 3-50 chars)")
  .action(createCommand);

program
  .command("list")
  .description("List all provisioned apps")
  .action(listCommand);

program
  .command("destroy")
  .description("Tear down a provisioned app")
  .argument("<name>", "Name of the app to destroy")
  .action(destroyCommand);

program.parse();
