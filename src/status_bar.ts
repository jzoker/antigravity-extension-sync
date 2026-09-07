import * as vscode from 'vscode';

const STATUS_BAR_ALIGNMENT = vscode.StatusBarAlignment.Right;
const STATUS_BAR_PRIORITY = 100;

export interface SyncStatusBarController {
  item: vscode.StatusBarItem;
  setIdle(message?: string): void;
  setSyncing(message?: string): void;
  setError(message?: string): void;
  dispose(): void;
}

/** Creates and configures the Status Bar item for displaying synchronization status. */
export function createSyncStatusBar(): SyncStatusBarController {
  const item = vscode.window.createStatusBarItem(STATUS_BAR_ALIGNMENT, STATUS_BAR_PRIORITY);
  item.command = 'antigravitySync.showMenu';
  item.text = '$(cloud-upload) Antigravity Sync';
  item.tooltip = 'Antigravity Extension Sync: Click for options';
  item.show();

  return {
    item,
    setIdle(message: string = 'Synced') {
      item.text = `$(cloud-upload) Antigravity: ${message}`;
      item.backgroundColor = undefined;
    },
    setSyncing(message: string = 'Syncing...') {
      item.text = `$(sync~spin) Antigravity: ${message}`;
      item.backgroundColor = undefined;
    },
    setError(message: string = 'Sync Error') {
      item.text = `$(error) Antigravity: ${message}`;
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    },
    dispose() {
      item.dispose();
    },
  };
}

/** Displays an interactive QuickPick menu allowing the user to select synchronization actions. */
export async function showQuickPickMenu(): Promise<void> {
  const options = [
    {
      label: '$(cloud-upload) Upload Config to Cloud',
      detail: 'Push local rules (GEMINI.md) and configuration to cloud Gist',
      command: 'antigravitySync.upload',
    },
    {
      label: '$(cloud-download) Download Config from Cloud',
      detail: 'Pull remote rules and configuration from cloud Gist to local machine',
      command: 'antigravitySync.download',
    },
    {
      label: '$(file-text) Open Global Rules (GEMINI.md)',
      detail: 'Open the global GEMINI.md rules file in editor',
      command: 'antigravitySync.openRules',
    },
    {
      label: '$(folder) Open Config Folder',
      detail: 'Reveal the ~/.gemini/config folder in system explorer',
      command: 'antigravitySync.openConfig',
    },
    {
      label: '$(globe) Open Cloud Gist in Browser',
      detail: 'View your remote configuration Gist on GitHub in browser',
      command: 'antigravitySync.openGist',
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select an Antigravity Sync action',
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

