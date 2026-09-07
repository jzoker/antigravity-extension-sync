import * as path from 'path';
import * as vscode from 'vscode';
import {
  EXTENSION_CONFIG_SECTION,
  GIST_CONFIG_BUNDLE,
  GIST_DESCRIPTION,
  GLOBAL_STATE_GIST_KEY,
} from './constants';
import {
  AntigravityPaths,
  ConfigFileMap,
  isPathAllowedForSync,
  scanAllowedSyncFiles,
  writeSafeFile,
} from './platform';

const GITHUB_API_URL = 'https://api.github.com/gists';
const AUTH_PROVIDER_ID = 'github';
const AUTH_SCOPES = ['gist'];

interface GistFileEntry {
  filename?: string;
  content: string;
  truncated?: boolean;
  raw_url?: string;
  size?: number;
}

interface GistResponse {
  id: string;
  description: string;
  files: {
    [filename: string]: GistFileEntry | null;
  };
}

/** Obtains an active GitHub authentication session with gist permissions from the editor. */
export async function getGithubSession(createIfNone: boolean = true): Promise<vscode.AuthenticationSession> {
  const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone });
  if (!session) {
    throw new Error('GitHub authentication failed or was cancelled by user.');
  }
  return session;
}

/** Finds an existing Antigravity sync Gist on the user account without creating an empty one. */
export async function findExistingGistId(context: vscode.ExtensionContext, token: string): Promise<string | null> {
  // 1. Check user settings override
  const configGistId = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION).get<string>('gistId');
  if (configGistId && configGistId.trim() !== '') {
    return configGistId.trim();
  }

  // 2. Check cached ID in global state
  const cachedGistId = context.globalState.get<string>(GLOBAL_STATE_GIST_KEY);
  if (cachedGistId && cachedGistId.trim() !== '') {
    return cachedGistId.trim();
  }

  // 3. Search user's existing Gists for matching description
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Antigravity-Extension-Sync',
  };

  const listRes = await fetch(GITHUB_API_URL, { headers });
  if (listRes.ok) {
    const gists = (await listRes.json()) as GistResponse[];
    const matched = gists.find((g) => g.description === GIST_DESCRIPTION);
    if (matched) {
      await context.globalState.update(GLOBAL_STATE_GIST_KEY, matched.id);
      return matched.id;
    }
  }

  return null;
}

/** Uploads the complete local config directory bundle to the secret Gist as a single file. */
export async function uploadConfig(
  context: vscode.ExtensionContext,
  paths: AntigravityPaths,
): Promise<{ filesUploaded: number; gistId: string }> {
  const session = await getGithubSession(true);
  let gistId = await findExistingGistId(context, session.accessToken);

  const localConfigBundle = scanAllowedSyncFiles(paths.configDir);
  const configCount = Object.keys(localConfigBundle).length;

  if (configCount === 0) {
    throw new Error('Local rules and skills are empty. Upload aborted to protect cloud backup.');
  }

  // Single file bundle containing all configs, rules, and skills
  const payloadFiles: { [filename: string]: { content: string } | null } = {
    [GIST_CONFIG_BUNDLE]: {
      content: JSON.stringify(localConfigBundle, null, 2),
    },
    // Explicitly delete legacy standalone GEMINI.md from Gist if present
    'GEMINI.md': null,
  };

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Antigravity-Extension-Sync',
  };

  if (gistId) {
    // Update existing Gist
    const res = await fetch(`${GITHUB_API_URL}/${gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        files: payloadFiles,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cloud update failed (status ${res.status}): ${errText}`);
    }
  } else {
    // Create new Gist with single bundle file
    const res = await fetch(GITHUB_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_CONFIG_BUNDLE]: {
            content: JSON.stringify(localConfigBundle, null, 2),
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cloud creation failed (status ${res.status}): ${errText}`);
    }

    const created = (await res.json()) as GistResponse;
    gistId = created.id;
    await context.globalState.update(GLOBAL_STATE_GIST_KEY, gistId);
  }

  return {
    filesUploaded: configCount,
    gistId,
  };
}

/** Downloads and restores the config directory bundle from the secret Gist to the local machine. */
export async function downloadConfig(
  context: vscode.ExtensionContext,
  paths: AntigravityPaths,
): Promise<{ filesDownloaded: number; gistId: string }> {
  const session = await getGithubSession(false);
  const gistId = await findExistingGistId(context, session.accessToken);

  if (!gistId) {
    // No remote Gist exists; do NOT overwrite local files!
    return { filesDownloaded: 0, gistId: '' };
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Antigravity-Extension-Sync',
  };

  const res = await fetch(`${GITHUB_API_URL}/${gistId}`, { headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloud download failed (status ${res.status}): ${errText}`);
  }

  const gist = (await res.json()) as GistResponse;
  let restoredCount = 0;

  const bundleEntry = gist.files ? gist.files[GIST_CONFIG_BUNDLE] : null;
  if (bundleEntry) {
    try {
      let rawContent = bundleEntry.content;
      // If GitHub truncated the bundle (e.g., file > 1MB), fetch from raw_url
      if (bundleEntry.truncated && bundleEntry.raw_url) {
        const rawRes = await fetch(bundleEntry.raw_url, { headers });
        if (rawRes.ok) {
          rawContent = await rawRes.text();
        }
      }

      if (rawContent && rawContent.trim() !== '') {
        const bundle = JSON.parse(rawContent) as ConfigFileMap;
        for (const [relativePath, content] of Object.entries(bundle)) {
          if (!isPathAllowedForSync(relativePath)) {
            console.log(`[AntigravitySync] Skipping disallowed path during restore: ${relativePath}`);
            continue;
          }
          const destPath = path.join(paths.configDir, relativePath);
          writeSafeFile(destPath, content);
          restoredCount += 1;
        }
      }
    } catch (err) {
      console.error('[AntigravitySync] Error parsing remote config bundle:', err);
    }
  }

  return {
    filesDownloaded: restoredCount,
    gistId,
  };
}
