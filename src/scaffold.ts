import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

export type ScaffoldOptions = {
  force?: boolean;
  install?: boolean;
  projectName: string;
  runInstall?: (targetDir: string) => Promise<number>;
  templateRepo?: string;
  targetDir: string;
};

export type ScaffoldResult = {
  createdFiles: string[];
  installedDependencies: boolean;
  projectName: string;
  targetDir: string;
};

const DEFAULT_TEMPLATE_REPO = "https://github.com/rayhanadev/fresh";

export function normalizePackageName(projectName: string): string {
  return (
    projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "bun-app"
  );
}

export async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length === 0;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

async function runBunInstall(targetDir: string): Promise<number> {
  const { exitCode, stderr } = await runCommand(["bun", "install"], {
    cwd: targetDir,
    quiet: true,
  });

  if (exitCode !== 0 && stderr.length > 0) {
    console.error(stderr);
  }

  return exitCode;
}

async function runCommand(
  cmd: string[],
  options?: {
    cwd?: string;
    quiet?: boolean;
  },
): Promise<{ exitCode: number; stderr: string }> {
  const quiet = options?.quiet ?? false;
  const proc = Bun.spawn({
    cmd,
    cwd: options?.cwd,
    stderr: quiet ? "pipe" : "inherit",
    stdout: quiet ? "ignore" : "inherit",
  });

  if (!quiet || proc.stderr === null) {
    return { exitCode: await proc.exited, stderr: "" };
  }

  const stderrPromise = new Response(proc.stderr).text();
  const [exitCode, stderr] = await Promise.all([proc.exited, stderrPromise]);
  return { exitCode, stderr: stderr.trim() };
}

async function cloneTemplateRepo(templateRepo: string, stagingDir: string): Promise<void> {
  const { exitCode, stderr } = await runCommand(
    ["git", "clone", "--depth", "1", "--quiet", templateRepo, stagingDir],
    { quiet: true },
  );

  if (exitCode !== 0) {
    const suffix = stderr.length > 0 ? ` ${stderr}` : "";
    throw new Error(`git clone failed with exit code ${exitCode}.${suffix}`);
  }
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

async function applyTemplateTokens(filePaths: string[], projectName: string): Promise<void> {
  const packageName = normalizePackageName(projectName);
  const textExtensions = new Set([
    ".json",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".md",
    ".txt",
    ".toml",
    ".yaml",
    ".yml",
  ]);

  await Promise.all(
    filePaths.map(async (filePath) => {
      const ext = extname(filePath);
      if (!textExtensions.has(ext) && !filePath.endsWith(".gitignore")) {
        return;
      }

      const file = Bun.file(filePath);
      const original = await file.text();
      const next = original
        .replaceAll("__PROJECT_NAME__", projectName)
        .replaceAll("__PACKAGE_NAME__", packageName);

      if (next !== original) {
        await Bun.write(filePath, next);
      }
    }),
  );
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const targetDir = resolve(options.targetDir);
  const projectName = options.projectName.trim();
  const force = options.force ?? false;
  const install = options.install ?? true;
  const runInstall = options.runInstall ?? runBunInstall;
  const templateRepo = options.templateRepo ?? DEFAULT_TEMPLATE_REPO;

  if (projectName.length === 0) {
    throw new Error("Project name must not be empty.");
  }

  if (!(await isDirectoryEmpty(targetDir)) && !force) {
    throw new Error(`Target directory is not empty: ${targetDir}. Use --force to overwrite.`);
  }

  await mkdir(targetDir, { recursive: true });

  const stagingDirPrefix = resolve(dirname(targetDir), ".new-template-");
  const stagingDir = await mkdtemp(stagingDirPrefix);

  try {
    await cloneTemplateRepo(templateRepo, stagingDir);
    await rm(resolve(stagingDir, ".git"), { force: true, recursive: true });

    const templateFiles = await listFilesRecursively(stagingDir);
    const createdFiles = templateFiles.map((filePath) =>
      resolve(targetDir, relative(stagingDir, filePath)),
    );

    await cp(stagingDir, targetDir, {
      force: true,
      recursive: true,
    });
    await applyTemplateTokens(createdFiles, projectName);

    let installedDependencies = false;
    if (install) {
      const exitCode = await runInstall(targetDir);
      if (exitCode !== 0) {
        throw new Error(`bun install failed with exit code ${exitCode}.`);
      }
      installedDependencies = true;
    }

    return {
      createdFiles,
      installedDependencies,
      projectName,
      targetDir,
    };
  } finally {
    await rm(stagingDir, { force: true, recursive: true });
  }
}
