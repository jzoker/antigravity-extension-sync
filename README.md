# Antigravity Extension Sync

**Antigravity Extension Sync** is an extension designed to synchronize your Google Antigravity agent configurations, global rules, and custom skills across multiple machines (Linux, macOS, and Windows) using private GitHub Gists.

---

## 🎯 What is Synchronized?

This extension synchronizes portable configuration files stored in your Antigravity directory (`~/.gemini/config/`):

| Category | Path | Description |
| :--- | :--- | :--- |
| **Rules** | `config/rules/` (and root `config/GEMINI.md`) | **All** rule files (`GEMINI.md`, language-specific rules, coding standards, custom guidelines). |
| **Agent Skills** | `config/skills/` | **All** custom agent skills, workflows, tool definitions (`SKILL.md`), scripts, and reference assets. |

### 🛡️ What is NOT Synchronized?
To protect sensitive data and prevent bloating cloud storage, machine-specific and temporary files are strictly **excluded**:
- Conversation logs, transcripts, and session states (`~/.gemini/antigravity/brain/`)
- Local runtime cache and temporary artifacts
- Machine-specific credentials and authentication tokens

---

## ✨ Features

- **Zero-Config GitHub Authentication**: Connects securely using VS Code's native GitHub authentication session—no manual Personal Access Tokens (PAT) needed.
- **Cross-Platform Path Discovery**: Automatically detects Antigravity directories on Linux (`~/.gemini`), macOS (`~/.gemini`), and Windows (`%USERPROFILE%\.gemini`).
- **Private & Secure**: Bundles and stores configuration files into a private Secret GitHub Gist linked to your account.
- **Safe Restore & Backups**: Automatically creates `.bak` backup copies before replacing any local files during download.
- **Automatic Sync Options**:
  - **Sync on Startup**: Automatically pull the latest remote rules when opening the editor.
  - **Sync on Save**: Automatically upload updates with a 3-second debounce whenever rules or skills are modified.
- **Status Bar Integration**: Displays sync status in the bottom bar with a one-click action menu.

---

## 🚀 Getting Started

### 1. First Machine (Upload Setup)
1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run **`Antigravity Sync: Upload Config to Cloud`**.
3. Authorize GitHub when prompted by the editor.
4. Your Antigravity rules and skills will be backed up to your private GitHub Gist.

### 2. Other Machines (Download & Sync)
1. Install **Antigravity Extension Sync** on your other machine.
2. Run **`Antigravity Sync: Download Config from Cloud`**.
3. Sign in to the same GitHub account.
4. Your rules and skills will be synchronized and ready for use.

---

## 🛠️ Available Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) or by clicking the Status Bar item:

| Command | Identifier | Description |
| :--- | :--- | :--- |
| **Upload Config to Cloud** | `antigravitySync.upload` | Uploads local `rules/` and `skills/` to your private GitHub Gist. |
| **Download Config from Cloud** | `antigravitySync.download` | Downloads and applies remote configuration to the local Antigravity directory. |
| **Open Global Rules** | `antigravitySync.openRules` | Opens `GEMINI.md` directly in the editor. |
| **Open Config Folder** | `antigravitySync.openConfig` | Opens the `~/.gemini/config/` directory in the system file manager. |
| **Open Cloud Gist in Browser** | `antigravitySync.openGist` | Opens the storage Gist on GitHub in your default browser. |

---

## ⚙️ Extension Settings

Configure synchronization behavior in VS Code Settings (`settings.json`):

```json
{
  // Automatically pull the latest configuration when the editor starts (default: false)
  "antigravitySync.autoSyncOnStartup": false,

  // Automatically upload changes to cloud when editing rules or skills (default: false)
  "antigravitySync.autoSyncOnSave": false,

  // (Optional) Custom path override for .gemini directory
  "antigravitySync.customPath": "",

  // (Optional) Specific Gist ID to sync with (automatically detected if blank)
  "antigravitySync.gistId": ""
}
```

---

##  License

MIT License.
