import * as fs from 'fs';
import * as vscode from 'vscode';
import { EXTENSION_CONFIG_SECTION, SYNC_DEBOUNCE_MS } from './constants';
import { downloadConfig, uploadConfig } from './gist_sync';
import { resolveAntigravityPaths } from './platform';
import { createSyncStatusBar, showQuickPickMenu } from './status_bar';

let saveDebounceTimer: NodeJS.Timeout | null = null;

/** Activates the extension, registering commands, status bar, and file watchers. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusBar = createSyncStatusBar();
  context.subscriptions.push(statusBar);

  const paths = resolveAntigravityPaths();

  // Command: Upload
  const uploadDisposable = vscode.commands.registerCommand('antigravitySync.upload', async () => {
    try {
      statusBar.setSyncing('Uploading...');
      const result = await uploadConfig(context, paths);
      statusBar.setIdle('Synced');
      vscode.window.showInformationMessage(
        `[Antigravity Sync] Successfully uploaded ${result.filesUploaded} items to cloud Gist (${result.gistId}).`,
      );
    } catch (err: unknown) {
      statusBar.setError('Upload Failed');
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`[Antigravity Sync] Upload error: ${message}`);
    }
  });

  // Command: Download
  const downloadDisposable = vscode.commands.registerCommand('antigravitySync.download', async () => {
    try {
      statusBar.setSyncing('Downloading...');
      const result = await downloadConfig(context, paths);
      statusBar.setIdle('Synced');
      vscode.window.showInformationMessage(
        `[Antigravity Sync] Successfully downloaded ${result.filesDownloaded} items from cloud.`,
      );
    } catch (err: unknown) {
      statusBar.setError('Download Failed');
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`[Antigravity Sync] Download error: ${message}`);
    }
  });

  // Command: Open Global Rules
  const openRulesDisposable = vscode.commands.registerCommand('antigravitySync.openRules', async () => {
    if (!fs.existsSync(paths.rulesFile)) {
      // Create template file if missing
      fs.writeFileSync(paths.rulesFile, '# Coding\n1. Keep code minimal\n', 'utf8');
    }
    const doc = await vscode.workspace.openTextDocument(paths.rulesFile);
    await vscode.window.showTextDocument(doc);
  });

  // Command: Open Config Folder
  const openConfigDisposable = vscode.commands.registerCommand('antigravitySync.openConfig', async () => {
    if (!fs.existsSync(paths.configDir)) {
      fs.mkdirSync(paths.configDir, { recursive: true });
    }
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(paths.configDir));
  });

  // Command: QuickPick Menu
  const menuDisposable = vscode.commands.registerCommand('antigravitySync.showMenu', async () => {
    await showQuickPickMenu();
  });

  // Watcher: Auto-sync on file save
  const saveWatcherDisposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION);
    const autoSyncOnSave = config.get<boolean>('autoSyncOnSave', true);
    if (!autoSyncOnSave) {
      return;
    }

    const savedPath = document.uri.fsPath;
    // Check if the saved file is inside ~/.gemini
    if (savedPath.startsWith(paths.geminiDir)) {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }
      // Debounce trigger (e.g., wait 3000ms after last keystroke/save)
      saveDebounceTimer = setTimeout(async () => {
        try {
          statusBar.setSyncing('Auto-uploading...');
          const result = await uploadConfig(context, paths);
          statusBar.setIdle('Synced');
          vscode.window.setStatusBarMessage(
            `[Antigravity Sync] Auto-uploaded ${result.filesUploaded} items to cloud.`,
            4000,
          );
        } catch (err: unknown) {
          statusBar.setError('Sync Error');
          console.error('[AntigravitySync] Auto-upload failed:', err);
        }
      }, SYNC_DEBOUNCE_MS);
    }
  });

  context.subscriptions.push(
    uploadDisposable,
    downloadDisposable,
    openRulesDisposable,
    openConfigDisposable,
    menuDisposable,
    saveWatcherDisposable,
  );

  // Auto-sync on startup if enabled
  const autoSyncOnStartup = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION).get<boolean>('autoSyncOnStartup', true);
  if (autoSyncOnStartup) {
    // Delay slightly after editor startup (e.g., 2000ms) to ensure auth provider is ready
    setTimeout(async () => {
      try {
        statusBar.setSyncing('Syncing on launch...');
        const result = await downloadConfig(context, paths);
        statusBar.setIdle('Synced');
        console.log(`[AntigravitySync] Startup sync completed: ${result.filesDownloaded} items.`);
      } catch (err: unknown) {
        statusBar.setIdle('Ready');
        console.warn('[AntigravitySync] Startup download skipped or deferred:', err);
      }
    }, 2000);
  } else {
    statusBar.setIdle('Ready');
  }
}

/** Deactivates the extension, clearing timers and open resources. */
export function deactivate(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
}

