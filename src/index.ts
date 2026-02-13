#!/usr/bin/env bun
import { basename, resolve } from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  outro,
  spinner,
  text,
} from "@clack/prompts";
import { isDirectoryEmpty, scaffoldProject } from "./scaffold";

type CliOptions = {
  force: boolean;
  help: boolean;
  install: boolean;
  pathArg: string | null;
  projectNameArg: string | null;
  version: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    force: false,
    help: false,
    install: true,
    pathArg: null,
    projectNameArg: null,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      options.version = true;
      continue;
    }

    if (arg === "--force" || arg === "-f") {
      options.force = true;
      continue;
    }

    if (arg === "--no-install") {
      options.install = false;
      continue;
    }

    if (arg === "--path" || arg === "-p") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`Missing value for ${arg}.`);
      }
      if (next.trim().length === 0) {
        throw new Error("Path must not be empty.");
      }
      if (options.pathArg !== null) {
        throw new Error("Path can only be provided once.");
      }
      options.pathArg = next;
      i += 1;
      continue;
    }

    if (arg.startsWith("--path=") || arg.startsWith("-p=")) {
      const value = arg.slice(arg.indexOf("=") + 1);
      if (value.trim().length === 0) {
        throw new Error("Path must not be empty.");
      }
      if (options.pathArg !== null) {
        throw new Error("Path can only be provided once.");
      }
      options.pathArg = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.projectNameArg !== null) {
      throw new Error("Only one project name can be provided.");
    }

    options.projectNameArg = arg;
  }

  if (options.projectNameArg !== null && options.pathArg !== null) {
    throw new Error("Use either a project name argument or --path, not both.");
  }

  return options;
}

function printHelp(): void {
  console.log(`
new - scaffold a new Bun project

Usage:
  new [project-name] [options]
  new --path <path> [options]

Options:
  -f, --force       overwrite non-empty target directory
  -p, --path        target directory path
      --no-install  skip bun install after scaffold
  -h, --help        show help
  -v, --version     show version
`.trim());
}

function exitCancelled(): never {
  cancel("Operation cancelled.");
  process.exit(0);
}

async function run(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
    console.log(String(pkg.version ?? "0.0.0"));
    return;
  }

  intro("new");

  const cwd = process.cwd();
  let targetDir = cwd;
  let projectName = basename(cwd);

  if (options.pathArg !== null) {
    targetDir = resolve(cwd, options.pathArg);
    projectName = basename(targetDir);
  } else if (options.projectNameArg !== null) {
    targetDir = resolve(cwd, options.projectNameArg);
    projectName = basename(targetDir);
  } else {
    const empty = await isDirectoryEmpty(cwd);
    if (!empty) {
      if (!Bun.stdin.isTTY) {
        throw new Error(
          "Current directory is not empty. Use `new <project-name>` or `new --path <path>`.",
        );
      }

      const answer = await text({
        message: "Project name",
        placeholder: "my-bun-app",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Project name is required.";
          }
          return undefined;
        },
      });

      if (isCancel(answer)) {
        exitCancelled();
      }

      targetDir = resolve(cwd, answer.trim());
      projectName = basename(targetDir);
    }
  }

  if (projectName.trim().length === 0) {
    throw new Error("Project name is required.");
  }

  if (!(await isDirectoryEmpty(targetDir)) && !options.force) {
    if (!Bun.stdin.isTTY) {
      throw new Error(`Target directory is not empty: ${targetDir}. Use --force to overwrite.`);
    }

    const shouldOverwrite = await confirm({
      initialValue: false,
      message: `Target directory is not empty: ${targetDir}. Overwrite scaffold files?`,
    });

    if (isCancel(shouldOverwrite)) {
      exitCancelled();
    }

    if (!shouldOverwrite) {
      throw new Error("Aborted because target directory is not empty.");
    }

    options.force = true;
  }

  const spin = spinner();
  spin.start("Scaffolding Bun project");

  const result = await scaffoldProject({
    force: options.force,
    install: options.install,
    projectName,
    targetDir,
  });

  spin.stop("Scaffold complete");
  log.success(`Created Bun project in ${result.targetDir}`);
  if (result.installedDependencies) {
    log.info("Installed dependencies with bun install");
  } else {
    log.info("Skipped dependency install (--no-install)");
  }
  outro("Next step: bun run src/index.ts");
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
