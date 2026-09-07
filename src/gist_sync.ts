import * as path from 'path';
import * as vscode from 'vscode';
import {
  EXTENSION_CONFIG_SECTION,
  GIST_CONFIG_BUNDLE,
  GIST_DESCRIPTION,
  GIST_ROOT_RULES,
  GLOBAL_STATE_GIST_KEY,
} from './constants';
import {
  AntigravityPaths,
  ConfigFileMap,
  readGlobalRules,
  scanDirectoryRecursive,
  writeSafeFile,
} from './platform';

const GITHUB_API_URL = 'https://api.github.com/gists';
const AUTH_PROVIDER_ID = 'github';
const AUTH_SCOPES = ['gist'];

interface GistFileEntry {
  filename?: string;
  content: string;
}

interface GistResponse {
  id: string;
  description: string;
  files: {
    [filename: string]: GistFileEntry;
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

/** Finds an existing Antigravity sync Gist or creates a new private secret Gist. */
export async function getOrCreateGistId(context: vscode.ExtensionContext, token: string): Promise<string> {
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

  // 4. Create new secret Gist
  const createPayload = {
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_ROOT_RULES]: {
        content: '# Coding\n1. Keep code minimal\n',
      },
      [GIST_CONFIG_BUNDLE]: {
        content: JSON.stringify({}, null, 2),
      },
    },
  };

  const createRes = await fetch(GITHUB_API_URL, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create secret Gist on cloud: ${createRes.status} ${errText}`);
  }

  const createdGist = (await createRes.json()) as GistResponse;
  await context.globalState.update(GLOBAL_STATE_GIST_KEY, createdGist.id);
  return createdGist.id;
}

/** Uploads local configuration files and global rules to the secret Gist. */
export async function uploadConfig(
  context: vscode.ExtensionContext,
  paths: AntigravityPaths,
): Promise<{ filesUploaded: number; gistId: string }> {
  const session = await getGithubSession(true);
  const gistId = await getOrCreateGistId(context, session.accessToken);

  const localRules = readGlobalRules(paths.rulesFile);
  const localConfigBundle = scanDirectoryRecursive(paths.configDir);
  const configCount = Object.keys(localConfigBundle).length;

  const payloadFiles: { [filename: string]: { content: string } } = {
    [GIST_ROOT_RULES]: {
      content: localRules !== null ? localRules : '# Rules\n',
    },
    [GIST_CONFIG_BUNDLE]: {
      content: JSON.stringify(localConfigBundle, null, 2),
    },
  };

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Antigravity-Extension-Sync',
  };

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
    throw new Error(`Cloud upload failed (e.g., status ${res.status}): ${errText}`);
  }

  return {
    filesUploaded: configCount + (localRules !== null ? 1 : 0),
    gistId,
  };
}

/** Downloads remote configuration and global rules from the secret Gist to the local machine. */
export async function downloadConfig(
  context: vscode.ExtensionContext,
  paths: AntigravityPaths,
): Promise<{ filesDownloaded: number; gistId: string }> {
  const session = await getGithubSession(true);
  const gistId = await getOrCreateGistId(context, session.accessToken);

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Antigravity-Extension-Sync',
  };

  const res = await fetch(`${GITHUB_API_URL}/${gistId}`, { headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloud download failed (e.g., status ${res.status}): ${errText}`);
  }

  const gist = (await res.json()) as GistResponse;
  let restoredCount = 0;

  // Restore GEMINI.md global rules
  if (gist.files && gist.files[GIST_ROOT_RULES]) {
    writeSafeFile(paths.rulesFile, gist.files[GIST_ROOT_RULES].content);
    restoredCount += 1;
  }

  // Restore bundled configs under ~/.gemini/config
  if (gist.files && gist.files[GIST_CONFIG_BUNDLE]) {
    try {
      const bundle = JSON.parse(gist.files[GIST_CONFIG_BUNDLE].content) as ConfigFileMap;
      for (const [relativePath, content] of Object.entries(bundle)) {
        const destPath = path.join(paths.configDir, relativePath);
        writeSafeFile(destPath, content);
        restoredCount += 1;
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

