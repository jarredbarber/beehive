import { Task } from '../types.js';
import { execSync } from 'child_process';
import { getTitle } from './output.js';

export class Notifier {
  private notifyCmd: string | undefined;

  constructor(notifyCmd?: string) {
    this.notifyCmd = notifyCmd;
  }

  async notify(title: string, message: string, priority?: number) {
    if (!this.notifyCmd) return;

    try {
      const escape = (s: string) => s.replace(/'/g, "'\\''");
      const rendered = this.notifyCmd
        .replace(/\{\{message\}\}/g, escape(message))
        .replace(/\{\{title\}\}/g, escape(title))
        .replace(/\{\{priority\}\}/g, String(priority ?? 3));

      execSync(rendered, { stdio: 'ignore', timeout: 15000 });
    } catch (error) {
      // Fail silently
    }
  }

  async notifyTaskUpdate(task: Task, status: 'completed' | 'failed' | 'needs_input' | 'blocked', summary: string) {
    if (!this.notifyCmd) return;

    let title = '';
    let priority = 3;

    switch (status) {
      case 'completed':
        title = `✅ Task Completed: ${task.id}`;
        break;
      case 'failed':
        title = `❌ Task Failed: ${task.id}`;
        priority = 4;
        break;
      case 'needs_input':
        title = `❓ Task Needs Input: ${task.id}`;
        priority = 5;
        break;
      case 'blocked':
        title = `⏸️ Task Blocked: ${task.id}`;
        break;
    }

    // Extract title from first line of description
    const taskTitle = getTitle(task.description);
    const message = `${taskTitle}\n\n${summary}`;
    await this.notify(title, message, priority);
  }
}
