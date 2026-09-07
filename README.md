# Antigravity Extension Sync

Cross-platform configuration and rule synchronizer across multiple operating environments.

## Features

- **Automated Directory Discovery**: Resolves configuration directories and rule files automatically based on the host environment.
- **Bi-Directional Cloud Synchronization**: Uploads and downloads configuration settings and rules with zero manual token setup.
- **Automatic Sync**: Synchronizes updates automatically upon launch and whenever configuration files are modified.
- **Status Indicator**: Displays real-time synchronization state with quick action access.

## Usage

### Commands

- **Upload Config to Cloud**: Pushes local rules and configuration to remote storage.
- **Download Config from Cloud**: Pulls latest remote rules and configuration to the local environment.
- **Open Global Rules**: Opens the global rules file directly in the editor.
- **Open Config Folder**: Reveals the configuration folder in the system file browser.

### Settings

- `autoSyncOnStartup`: Automatically download latest settings upon editor launch (default: `false`).
- `autoSyncOnSave`: Automatically upload settings upon modifying and saving configuration files (default: `false`).
- `customPath`: Optional custom directory path override.
- `gistId`: Remote storage identifier for the configuration bundle.

