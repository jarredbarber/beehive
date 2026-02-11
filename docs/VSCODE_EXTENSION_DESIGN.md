# VSCode Extension Design Document

## Overview

This document describes the design for `vscode-tm`, a Visual Studio Code extension that provides a graphical interface for the `beehive` task management CLI. The extension prioritizes remote development support and maintains the CLI as the source of truth.

## Goals

1. **CLI-Centric**: All mutations go through the `bh` CLI; the extension is a view layer
2. **Remote-First**: Full functionality when connected to remote hosts via SSH, containers, or WSL
3. **Real-Time**: Reflect task and worker state changes as they happen
4. **Non-Intrusive**: Enhance workflow without requiring behavior changes

## Non-Goals (MVP)

- Multi-root workspace support (single `.bh` project per window)
- Git integration (showing task IDs in commits)
- Task creation wizard with templates
- Drag-and-drop dependency editing

---

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  VSCode Extension Host (runs where code runs - local OR remote)        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Extension Core                                                   │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │
│  │  │ TreeView    │  │ StatusBar   │  │ NotificationService     │  │  │
│  │  │ Provider    │  │ Controller  │  │                         │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │  │
│  │         │                │                      │               │  │
│  │         └────────────────┼──────────────────────┘               │  │
│  │                          ▼                                       │  │
│  │                 ┌─────────────────┐                              │  │
│  │                 │  TaskCache      │◀──────┐                      │  │
│  │                 │  (in-memory)    │       │                      │  │
│  │                 └────────┬────────┘       │                      │  │
│  │                          │                │                      │  │
│  │         ┌────────────────┼────────────────┤                      │  │
│  │         ▼                ▼                ▼                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│  │  │ TmCli       │  │ Backlog     │  │ LogWatcher  │              │  │
│  │  │ (executor)  │  │ Watcher     │  │             │              │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │  │
│  │         │                │                │                      │  │
│  └─────────┼────────────────┼────────────────┼──────────────────────┘  │
│            │                │                │                         │
│            ▼                ▼                ▼                         │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│     │ bh CLI      │  │ .bh/        │  │ .bh/logs/   │                 │
│     │ (spawn)     │  │ backlog.json│  │ worker-*.md │                 │
│     └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Remote Development Model

VSCode's remote development architecture runs the extension host on the remote machine. This is ideal for `vscode-tm` because:

1. **File watchers see remote files**: `.bh/backlog.json` changes are detected natively
2. **CLI executes remotely**: `bh` commands run where the code lives
3. **Workers run remotely**: `bh worker start` spawns on the remote machine
4. **No network latency for reads**: Task cache is local to the remote

```
┌─────────────────────┐         ┌─────────────────────────────────────┐
│  Local Machine      │   SSH   │  Remote Machine                     │
│  (Laptop)           │◀───────▶│  (Dev Server)                       │
│                     │         │                                     │
│  ┌───────────────┐  │         │  ┌───────────────────────────────┐  │
│  │ VSCode UI     │  │         │  │ VSCode Server                 │  │
│  │ (renderer)    │  │         │  │                               │  │
│  │               │  │         │  │  ┌─────────────────────────┐  │  │
│  │ Tree View ◀───┼──┼─────────┼──┼──│ vscode-tm extension     │  │  │
│  │ Status Bar◀───┼──┼─────────┼──┼──│                         │  │  │
│  │ Webviews  ◀───┼──┼─────────┼──┼──│  - TaskTreeProvider     │  │  │
│  │               │  │         │  │  │  - TmCli                │  │  │
│  └───────────────┘  │         │  │  │  - BacklogWatcher       │  │  │
│                     │         │  │  └───────────┬─────────────┘  │  │
│                     │         │  │              │                │  │
│                     │         │  │              ▼                │  │
│                     │         │  │  ┌─────────────────────────┐  │  │
│                     │         │  │  │ bh CLI + worker         │  │  │
│                     │         │  │  │ .bh/backlog.json        │  │  │
│                     │         │  │  │ .bh/logs/               │  │  │
│                     │         │  │  └─────────────────────────┘  │  │
│                     │         │  └───────────────────────────────┘  │
└─────────────────────┘         └─────────────────────────────────────┘
```

**Key Insight**: Because VSCode Remote runs the extension on the remote machine, we get remote support "for free" as long as we:
- Use `vscode.workspace.fs` for file operations (not Node's `fs`)
- Use VSCode's `Terminal` API or proper process spawning
- Don't assume local paths

---

## Components

### 1. TmCli Service

Wraps CLI execution with JSON parsing and error handling.

```typescript
interface TmCliOptions {
  cwd?: string;
  timeout?: number;
}

class TmCli {
  constructor(private workspaceRoot: string) {}

  async exec<T>(command: string, options?: TmCliOptions): Promise<T> {
    const result = await execAsync(`bh ${command} --json`, {
      cwd: options?.cwd || this.workspaceRoot,
      timeout: options?.timeout || 30000
    });
    return JSON.parse(result.stdout);
  }

  async execRaw(command: string): Promise<string> {
    const result = await execAsync(`bh ${command}`, {
      cwd: this.workspaceRoot
    });
    return result.stdout;
  }

  // Convenience methods
  async listTasks(filter?: 'ready' | 'all' | 'awaiting'): Promise<Task[]>;
  async getTask(id: string): Promise<Task>;
  async createTask(input: CreateTaskInput): Promise<Task>;
  async claimTask(id: string): Promise<Task>;
  async closeTask(id: string, summary: string): Promise<Task>;
  async workerStatus(): Promise<WorkerStatus>;
  async workerStart(options?: WorkerStartOptions): Promise<void>;
  async workerStop(): Promise<void>;
}
```

### 2. BacklogWatcher Service

Watches `.bh/backlog.json` and emits parsed task arrays on change.

```typescript
class BacklogWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher;
  private _onDidChange = new vscode.EventEmitter<Task[]>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private workspaceRoot: vscode.Uri) {
    const pattern = new vscode.RelativePattern(workspaceRoot, '.bh/backlog.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    this.watcher.onDidChange(() => this.emitTasks());
    this.watcher.onDidCreate(() => this.emitTasks());
  }

  private async emitTasks() {
    const uri = vscode.Uri.joinPath(this.workspaceRoot, '.bh/backlog.json');
    const content = await vscode.workspace.fs.readFile(uri);
    const tasks = this.parseJsonl(content.toString());
    this._onDidChange.fire(tasks);
  }

  private parseJsonl(content: string): Task[] {
    return content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
}
```

### 3. TaskCache

In-memory cache with computed properties for fast UI updates.

```typescript
class TaskCache {
  private tasks: Map<string, Task> = new Map();
  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private watcher: BacklogWatcher) {
    watcher.onDidChange(tasks => {
      this.tasks = new Map(tasks.map(t => [t.id, t]));
      this._onDidUpdate.fire();
    });
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getReadyTasks(): Task[] {
    return this.getAllTasks().filter(t => 
      t.state === 'open' && 
      t.role &&
      t.dependencies.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.state === 'closed';
      })
    );
  }

  getInProgressTasks(): Task[] {
    return this.getAllTasks().filter(t => t.state === 'in_progress');
  }

  getAwaitingInputTasks(): Task[] {
    return this.getAllTasks().filter(t => t.state === 'awaiting_input');
  }
}
```

### 4. TaskTreeProvider

Implements VSCode's TreeDataProvider for the sidebar.

```typescript
class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private cache: TaskCache) {
    cache.onDidUpdate(() => this._onDidChangeTreeData.fire(undefined));
  }

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeItem): TaskTreeItem[] {
    if (!element) {
      // Root level: group by state
      return [
        new TaskGroupItem('In Progress', this.cache.getInProgressTasks()),
        new TaskGroupItem('Awaiting Input', this.cache.getAwaitingInputTasks()),
        new TaskGroupItem('Ready', this.cache.getReadyTasks()),
      ].filter(g => g.tasks.length > 0);
    }

    if (element instanceof TaskGroupItem) {
      return element.tasks.map(t => new TaskItem(t));
    }

    if (element instanceof TaskItem) {
      // Show dependencies as children
      return element.task.dependencies
        .map(id => this.cache.getTask(id))
        .filter((t): t is Task => t !== undefined)
        .map(t => new TaskItem(t, true)); // isDependency = true
    }

    return [];
  }
}

class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly task: Task,
    private isDependency: boolean = false
  ) {
    super(task.title, 
      task.dependencies.length > 0 
        ? vscode.TreeItemCollapsibleState.Collapsed 
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = task.id;
    this.description = `${task.id} | p${task.priority}`;
    this.tooltip = this.buildTooltip();
    this.iconPath = this.getIcon();
    this.contextValue = `task.${task.state}`;
    
    if (!this.isDependency) {
      this.command = {
        command: 'tm.showTask',
        title: 'Show Task',
        arguments: [task.id]
      };
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.task.state) {
      case 'open': return new vscode.ThemeIcon('circle-outline');
      case 'in_progress': return new vscode.ThemeIcon('sync~spin');
      case 'closed': return new vscode.ThemeIcon('pass-filled');
      case 'failed': return new vscode.ThemeIcon('error');
      case 'blocked': return new vscode.ThemeIcon('debug-pause');
      case 'awaiting_input': return new vscode.ThemeIcon('question');
      case 'deferred': return new vscode.ThemeIcon('circle-slash');
      default: return new vscode.ThemeIcon('circle-outline');
    }
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${this.task.title}**\n\n`);
    md.appendMarkdown(`- **ID**: ${this.task.id}\n`);
    md.appendMarkdown(`- **State**: ${this.task.state}\n`);
    md.appendMarkdown(`- **Priority**: ${this.task.priority}\n`);
    md.appendMarkdown(`- **Role**: ${this.task.role || 'unassigned'}\n`);
    if (this.task.status) {
      md.appendMarkdown(`- **Status**: ${this.task.status}\n`);
    }
    if (this.task.description) {
      md.appendMarkdown(`\n---\n\n${this.task.description}`);
    }
    return md;
  }
}
```

### 5. StatusBarController

Shows worker status and quick stats.

```typescript
class StatusBarController implements vscode.Disposable {
  private statusItem: vscode.StatusBarItem;
  private workerItem: vscode.StatusBarItem;
  private pollInterval: NodeJS.Timeout;

  constructor(
    private cache: TaskCache,
    private cli: TmCli
  ) {
    // Task count indicator
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 
      100
    );
    this.statusItem.command = 'tm.focusTree';
    this.statusItem.show();

    // Worker status indicator
    this.workerItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.workerItem.command = 'tm.toggleWorker';
    this.workerItem.show();

    // Update on cache changes
    cache.onDidUpdate(() => this.updateTaskCount());

    // Poll worker status (file watch doesn't catch PID changes reliably)
    this.pollInterval = setInterval(() => this.updateWorkerStatus(), 5000);
    this.updateWorkerStatus();
  }

  private updateTaskCount() {
    const ready = this.cache.getReadyTasks().length;
    const inProgress = this.cache.getInProgressTasks().length;
    const awaiting = this.cache.getAwaitingInputTasks().length;

    let text = `$(tasklist) ${ready} ready`;
    if (inProgress > 0) text += ` | ${inProgress} active`;
    if (awaiting > 0) text += ` | $(question) ${awaiting}`;

    this.statusItem.text = text;
    this.statusItem.tooltip = 'Click to show task tree';
  }

  private async updateWorkerStatus() {
    try {
      const status = await this.cli.workerStatus();
      if (status.running) {
        this.workerItem.text = `$(vm-running) Worker`;
        this.workerItem.tooltip = `Worker running (PID: ${status.pid})\nClick to stop`;
        this.workerItem.backgroundColor = undefined;
      } else {
        this.workerItem.text = `$(vm-outline) Worker`;
        this.workerItem.tooltip = 'Worker stopped\nClick to start';
        this.workerItem.backgroundColor = undefined;
      }
    } catch (e) {
      this.workerItem.text = `$(warning) Worker`;
      this.workerItem.tooltip = 'Could not get worker status';
    }
  }
}
```

### 6. NotificationService

Shows toast notifications for important events.

```typescript
class NotificationService implements vscode.Disposable {
  private previousStates: Map<string, string> = new Map();

  constructor(private cache: TaskCache) {
    cache.onDidUpdate(() => this.checkForChanges());
  }

  private checkForChanges() {
    const tasks = this.cache.getAllTasks();
    
    for (const task of tasks) {
      const prevState = this.previousStates.get(task.id);
      
      if (prevState && prevState !== task.state) {
        this.notifyStateChange(task, prevState);
      }
      
      this.previousStates.set(task.id, task.state);
    }
  }

  private notifyStateChange(task: Task, prevState: string) {
    // Task completed
    if (task.state === 'closed' && prevState === 'in_progress') {
      vscode.window.showInformationMessage(
        `✅ Task ${task.id} completed: ${task.title}`,
        'Show Details'
      ).then(action => {
        if (action === 'Show Details') {
          vscode.commands.executeCommand('tm.showTask', task.id);
        }
      });
    }

    // Task failed
    if (task.state === 'failed') {
      vscode.window.showErrorMessage(
        `❌ Task ${task.id} failed: ${task.title}`,
        'Show Log',
        'Reopen'
      ).then(action => {
        if (action === 'Show Log') {
          vscode.commands.executeCommand('tm.showLog', task.id);
        } else if (action === 'Reopen') {
          vscode.commands.executeCommand('tm.reopenTask', task.id);
        }
      });
    }

    // Task needs input
    if (task.state === 'awaiting_input') {
      vscode.window.showWarningMessage(
        `❓ Task ${task.id} needs input: ${task.question || task.title}`,
        'Respond'
      ).then(action => {
        if (action === 'Respond') {
          vscode.commands.executeCommand('tm.respondToTask', task.id);
        }
      });
    }
  }
}
```

### 7. LogViewerPanel

Webview panel for viewing worker logs with auto-refresh.

```typescript
class LogViewerPanel {
  private static currentPanel: LogViewerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private watcher: vscode.FileSystemWatcher | undefined;

  static show(taskId: string, workspaceRoot: vscode.Uri) {
    const logUri = vscode.Uri.joinPath(workspaceRoot, '.bh', 'logs', `worker-${taskId}.md`);
    
    if (LogViewerPanel.currentPanel) {
      LogViewerPanel.currentPanel.panel.reveal();
      LogViewerPanel.currentPanel.watchLog(logUri);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'tmLogViewer',
      `Log: ${taskId}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    LogViewerPanel.currentPanel = new LogViewerPanel(panel, logUri);
  }

  private constructor(panel: vscode.WebviewPanel, logUri: vscode.Uri) {
    this.panel = panel;
    this.watchLog(logUri);
    
    panel.onDidDispose(() => {
      this.watcher?.dispose();
      LogViewerPanel.currentPanel = undefined;
    });
  }

  private watchLog(logUri: vscode.Uri) {
    this.watcher?.dispose();
    
    const pattern = new vscode.RelativePattern(
      vscode.Uri.joinPath(logUri, '..'),
      vscode.workspace.asRelativePath(logUri)
    );
    
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.updateContent(logUri));
    this.watcher.onDidCreate(() => this.updateContent(logUri));
    
    this.updateContent(logUri);
  }

  private async updateContent(logUri: vscode.Uri) {
    try {
      const content = await vscode.workspace.fs.readFile(logUri);
      const markdown = content.toString();
      
      // Convert markdown to HTML (simplified - use marked or similar in practice)
      const html = this.renderMarkdown(markdown);
      this.panel.webview.html = this.getWebviewContent(html);
    } catch (e) {
      this.panel.webview.html = this.getWebviewContent('<p>Log not found</p>');
    }
  }

  private getWebviewContent(bodyHtml: string): string {
    return `<!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: var(--vscode-font-family);
          padding: 20px;
          color: var(--vscode-foreground);
        }
        pre { 
          background: var(--vscode-textBlockQuote-background);
          padding: 10px;
          overflow-x: auto;
        }
        blockquote {
          border-left: 3px solid var(--vscode-textBlockQuote-border);
          margin-left: 0;
          padding-left: 10px;
          color: var(--vscode-descriptionForeground);
        }
      </style>
    </head>
    <body>${bodyHtml}</body>
    </html>`;
  }
}
```

---

## Commands

### package.json contributions

```json
{
  "contributes": {
    "commands": [
      {
        "command": "tm.createTask",
        "title": "Create Task",
        "category": "TM",
        "icon": "$(add)"
      },
      {
        "command": "tm.claimTask",
        "title": "Claim Task",
        "category": "TM"
      },
      {
        "command": "tm.closeTask",
        "title": "Close Task",
        "category": "TM"
      },
      {
        "command": "tm.reopenTask",
        "title": "Reopen Task",
        "category": "TM"
      },
      {
        "command": "tm.respondToTask",
        "title": "Respond to Task",
        "category": "TM"
      },
      {
        "command": "tm.showTask",
        "title": "Show Task Details",
        "category": "TM"
      },
      {
        "command": "tm.showLog",
        "title": "Show Worker Log",
        "category": "TM"
      },
      {
        "command": "tm.focusTree",
        "title": "Focus Task Tree",
        "category": "TM"
      },
      {
        "command": "tm.refreshTree",
        "title": "Refresh Task Tree",
        "category": "TM",
        "icon": "$(refresh)"
      },
      {
        "command": "tm.workerStart",
        "title": "Start Worker",
        "category": "TM"
      },
      {
        "command": "tm.workerStop",
        "title": "Stop Worker",
        "category": "TM"
      },
      {
        "command": "tm.toggleWorker",
        "title": "Toggle Worker",
        "category": "TM"
      },
      {
        "command": "tm.showTree",
        "title": "Show Tree in Terminal",
        "category": "TM"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "tmTasks",
          "name": "Tasks",
          "when": "workspaceFolderCount > 0"
        }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "tm",
          "title": "Tasks",
          "icon": "$(tasklist)"
        }
      ]
    },
    "menus": {
      "view/title": [
        {
          "command": "tm.createTask",
          "when": "view == tmTasks",
          "group": "navigation"
        },
        {
          "command": "tm.refreshTree",
          "when": "view == tmTasks",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "tm.claimTask",
          "when": "view == tmTasks && viewItem == task.open",
          "group": "inline"
        },
        {
          "command": "tm.closeTask",
          "when": "view == tmTasks && viewItem == task.in_progress"
        },
        {
          "command": "tm.respondToTask",
          "when": "view == tmTasks && viewItem == task.awaiting_input",
          "group": "inline"
        },
        {
          "command": "tm.showLog",
          "when": "view == tmTasks && viewItem =~ /task\\./"
        },
        {
          "command": "tm.reopenTask",
          "when": "view == tmTasks && viewItem =~ /task\\.(closed|failed)/"
        }
      ]
    }
  }
}
```

### Command Implementations

```typescript
// commands/createTask.ts
async function createTask(cli: TmCli) {
  const title = await vscode.window.showInputBox({
    prompt: 'Task title',
    placeHolder: 'Implement feature X'
  });
  if (!title) return;

  const role = await vscode.window.showQuickPick(
    ['code', 'test', 'review', 'docs', 'design', 'pm', '(none)'],
    { placeHolder: 'Select role' }
  );

  const priority = await vscode.window.showQuickPick(
    ['0 - Critical', '1 - High', '2 - Normal', '3 - Low', '4 - Backlog'],
    { placeHolder: 'Select priority' }
  );

  const args = [`-t "${title}"`];
  if (role && role !== '(none)') args.push(`-r ${role}`);
  if (priority) args.push(`-p ${priority.charAt(0)}`);

  await cli.execRaw(`create ${args.join(' ')}`);
  vscode.window.showInformationMessage(`Created task: ${title}`);
}

// commands/respondToTask.ts
async function respondToTask(cli: TmCli, cache: TaskCache, taskId: string) {
  const task = cache.getTask(taskId);
  if (!task || task.state !== 'awaiting_input') {
    vscode.window.showErrorMessage('Task is not awaiting input');
    return;
  }

  // Show the question in a modal
  const response = await vscode.window.showInputBox({
    prompt: task.question || 'Provide response',
    placeHolder: 'Your answer...',
    ignoreFocusOut: true
  });

  if (!response) return;

  await cli.execRaw(`respond ${taskId} "${response.replace(/"/g, '\\"')}"`);
  vscode.window.showInformationMessage(`Response recorded for ${taskId}`);
}
```

---

## Extension Activation

```typescript
// extension.ts
import * as vscode from 'vscode';

let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) {
    return; // No workspace open
  }

  // Check if this is a bh project
  const tmDir = vscode.Uri.joinPath(workspaceRoot, '.bh');
  try {
    await vscode.workspace.fs.stat(tmDir);
  } catch {
    // Not a bh project, don't activate
    return;
  }

  // Initialize services
  const cli = new TmCli(workspaceRoot.fsPath);
  const watcher = new BacklogWatcher(workspaceRoot);
  const cache = new TaskCache(watcher);

  // Initialize UI components
  const treeProvider = new TaskTreeProvider(cache);
  const statusBar = new StatusBarController(cache, cli);
  const notifications = new NotificationService(cache);

  // Register tree view
  const treeView = vscode.window.createTreeView('tmTasks', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // Register commands
  disposables.push(
    vscode.commands.registerCommand('tm.createTask', () => createTask(cli)),
    vscode.commands.registerCommand('tm.claimTask', (item: TaskItem) => 
      cli.execRaw(`claim ${item.task.id}`)
    ),
    vscode.commands.registerCommand('tm.closeTask', (item: TaskItem) => 
      closeTask(cli, item.task.id)
    ),
    vscode.commands.registerCommand('tm.respondToTask', (item: TaskItem) => 
      respondToTask(cli, cache, item.task.id)
    ),
    vscode.commands.registerCommand('tm.showTask', (taskId: string) => 
      showTaskDetail(cache, taskId)
    ),
    vscode.commands.registerCommand('tm.showLog', (item: TaskItem) => 
      LogViewerPanel.show(item.task.id, workspaceRoot)
    ),
    vscode.commands.registerCommand('tm.refreshTree', () => 
      treeProvider.refresh()
    ),
    vscode.commands.registerCommand('tm.focusTree', () => 
      treeView.reveal(undefined)
    ),
    vscode.commands.registerCommand('tm.workerStart', () => 
      cli.execRaw('worker start')
    ),
    vscode.commands.registerCommand('tm.workerStop', () => 
      cli.execRaw('worker stop')
    ),
    vscode.commands.registerCommand('tm.toggleWorker', async () => {
      const status = await cli.workerStatus();
      if (status.running) {
        await cli.execRaw('worker stop');
      } else {
        await cli.execRaw('worker start');
      }
    }),
    vscode.commands.registerCommand('tm.showTree', () => {
      const terminal = vscode.window.createTerminal('TM Tree');
      terminal.sendText('tm tree');
      terminal.show();
    })
  );

  disposables.push(treeView, statusBar, notifications, watcher);
  context.subscriptions.push(...disposables);
}

export function deactivate() {
  disposables.forEach(d => d.dispose());
}
```

---

## CLI Enhancements Required

### 1. Worker Status JSON Output

```bash
$ bh status --json
{"running": true, "pid": 12345}

$ bh status --json  # when stopped
{"running": false}
```

**Implementation**: Add `--json` flag to `bh status` command.

### 2. Improved Error Messages

Ensure all CLI commands return proper exit codes:
- `0` - Success
- `1` - General error
- `2` - Task not found
- `3` - Invalid state transition

---

## File Structure

```
vscode-tm/
├── .vscode/
│   └── launch.json           # Extension debugging config
├── src/
│   ├── extension.ts          # Entry point
│   ├── types.ts              # Shared type definitions
│   ├── services/
│   │   ├── TmCli.ts
│   │   ├── BacklogWatcher.ts
│   │   └── TaskCache.ts
│   ├── providers/
│   │   ├── TaskTreeProvider.ts
│   │   └── TaskItem.ts
│   ├── views/
│   │   ├── StatusBarController.ts
│   │   ├── NotificationService.ts
│   │   └── LogViewerPanel.ts
│   └── commands/
│       ├── createTask.ts
│       ├── claimTask.ts
│       ├── closeTask.ts
│       ├── respondToTask.ts
│       └── index.ts          # Command registration
├── resources/
│   └── icons/                # Custom icons (optional)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Testing Strategy

### Unit Tests

- `TaskCache`: Test computed properties with mock data
- `TmCli`: Mock child_process, test JSON parsing
- `NotificationService`: Test state change detection

### Integration Tests

- Use VSCode's test harness
- Create temp workspace with `.bh` directory
- Verify tree updates on file changes
- Verify commands invoke CLI correctly

### Manual Testing Checklist

1. [ ] Tree view shows tasks grouped by state
2. [ ] Tree updates when backlog.json changes
3. [ ] Status bar shows correct counts
4. [ ] Worker start/stop works
5. [ ] Notifications appear on state changes
6. [ ] Commands work from palette
7. [ ] Context menus work on tree items
8. [ ] Log viewer updates in real-time
9. [ ] Works over SSH remote
10. [ ] Works in Dev Container

---

## Rollout Plan

### Phase 1: Core (Week 1)
- Extension scaffold
- TmCli service
- BacklogWatcher + TaskCache
- Basic TreeView (flat list)

### Phase 2: Polish (Week 2)
- Grouped TreeView with dependencies
- StatusBar controller
- All basic commands (create, claim, close)

### Phase 3: Advanced (Week 3)
- NotificationService
- LogViewerPanel
- Respond to task command
- Worker management

### Phase 4: Testing & Release (Week 4)
- Integration tests
- Remote development testing
- Documentation
- Marketplace submission

---

## Open Questions

1. **Keybindings**: Should we provide default keybindings? (e.g., `Cmd+Shift+T` for create task)

2. **Activity Bar vs Explorer**: Should tasks appear in the Explorer sidebar or have their own Activity Bar icon?

3. **Task Detail View**: Should we use a Webview panel or a simple Quick Pick for viewing task details?

4. **Auto-refresh interval**: How often should we poll worker status? (Currently 5s)

5. **Theme**: Should we provide custom colors for task states, or rely on standard VSCode icons?

---

## Appendix: Type Definitions

```typescript
// types.ts
interface Task {
  id: string;
  title: string;
  description?: string;
  state: TaskState;
  role?: string;
  priority: number;
  size: 'small' | 'medium' | 'large';
  type: 'bug' | 'task' | 'chore';
  dependencies: string[];
  summary?: string;
  details?: string;
  status?: string;
  question?: string;
  questionContext?: string;
  humanResponse?: string;
  createdAt: string;
  updatedAt: string;
}

type TaskState = 
  | 'open' 
  | 'in_progress' 
  | 'closed' 
  | 'deferred' 
  | 'failed' 
  | 'blocked' 
  | 'awaiting_input';

interface WorkerStatus {
  running: boolean;
  pid?: number;
}

interface CreateTaskInput {
  title: string;
  description?: string;
  role?: string;
  priority?: number;
  size?: 'small' | 'medium' | 'large';
  type?: 'bug' | 'task' | 'chore';
  dependencies?: string[];
}
```
