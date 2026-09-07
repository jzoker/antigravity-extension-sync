import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ALLOWED_SYNC_SUBDIRS, EXTENSION_CONFIG_SECTION } from './constants';

export interface AntigravityPaths {
  platform: NodeJS.Platform;
  geminiDir: string;
  configDir: string;
  rulesFile: string;
}

export interface ConfigFileMap {
  [relativePath: string]: string; // Key: relative path under config (e.g., "skills/my_skill/SKILL.md"), Value: UTF-8 content
}

/** Resolves cross-platform paths for Antigravity directory, configuration files, and global rules. */
export function resolveAntigravityPaths(): AntigravityPaths {
  const customPath = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION).get<string>('customPath');
  const homeDir = os.homedir();
  // Automatically detects home directory across operating systems:
  // - Linux:   /home/<user>/.gemini
  // - macOS:   /Users/<user>/.gemini
  // - Windows: C:\Users\<user>\.gemini
  const geminiDir = customPath && customPath.trim() !== ''
    ? path.resolve(customPath)
    : path.join(homeDir, '.gemini');

  const configDir = path.join(geminiDir, 'config');

  // Locate rules file inside config directory:
  // 1. config/rules/GEMINI.md (standard)
  // 2. config/GEMINI.md
  // 3. Fallback to ~/.gemini/GEMINI.md if legacy
  let rulesFile = path.join(configDir, 'rules', 'GEMINI.md');
  if (fs.existsSync(rulesFile)) {
    // Found in config/rules/GEMINI.md
  } else if (fs.existsSync(path.join(configDir, 'GEMINI.md'))) {
    rulesFile = path.join(configDir, 'GEMINI.md');
  } else if (fs.existsSync(path.join(geminiDir, 'GEMINI.md'))) {
    rulesFile = path.join(geminiDir, 'GEMINI.md');
  }

  return {
    platform: process.platform,
    geminiDir: geminiDir,
    configDir: configDir,
    rulesFile: rulesFile,
  };
}

/** Normalizes line endings across platforms by converting CRLF (\r\n) to LF (\n). */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

/** Recursively reads all files in a directory and returns relative paths mapped to text content. */
export function scanDirectoryRecursive(dirPath: string, rootDir: string = dirPath): ConfigFileMap {
  const result: ConfigFileMap = {};
  if (!fs.existsSync(dirPath)) {
    return result;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, scanDirectoryRecursive(fullPath, rootDir));
    } else if (entry.isFile()) {
      try {
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf8');
        result[relativePath] = normalizeLineEndings(content);
      } catch (err) {
        // Skip unreadable or binary files gracefully (e.g., socket or lock files)
        console.warn(`[AntigravitySync] Failed to read ${fullPath}:`, err);
      }
    }
  }
  return result;
}

/** Scans strictly allowed directories (rules and skills), explicitly omitting machine-specific files. */
export function scanAllowedSyncFiles(configDir: string): ConfigFileMap {
  const result: ConfigFileMap = {};
  for (const subDir of ALLOWED_SYNC_SUBDIRS) {
    const targetDir = path.join(configDir, subDir);
    if (fs.existsSync(targetDir)) {
      Object.assign(result, scanDirectoryRecursive(targetDir, configDir));
    }
  }

  // Also include root GEMINI.md if placed directly under config
  const rootRules = path.join(configDir, 'GEMINI.md');
  if (fs.existsSync(rootRules)) {
    try {
      const content = fs.readFileSync(rootRules, 'utf8');
      result['GEMINI.md'] = normalizeLineEndings(content);
    } catch (err) {
      console.warn('[AntigravitySync] Failed to read root GEMINI.md:', err);
    }
  }

  return result;
}

/** Validates whether a relative path is allowed to be synchronized (whitelisted to rules and skills). */
export function isPathAllowedForSync(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized === 'GEMINI.md' || normalized === 'rules/GEMINI.md') {
    return true;
  }
  return ALLOWED_SYNC_SUBDIRS.some((subDir) => normalized.startsWith(`${subDir}/`));
}

/** Reads global rules file (GEMINI.md) if present on the local machine. */
export function readGlobalRules(rulesFilePath: string): string | null {
  if (fs.existsSync(rulesFilePath)) {
    return normalizeLineEndings(fs.readFileSync(rulesFilePath, 'utf8'));
  }
  return null;
}

/** Safely writes a file to disk, ensuring all parent directories exist beforehand. */
export function writeSafeFile(targetPath: string, content: string): void {
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(targetPath, content, 'utf8');
}
