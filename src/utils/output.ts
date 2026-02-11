import { Task } from '../types.js';

export function formatJson(data: any): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Extract title (first line) from description
 */
export function getTitle(description: string | undefined): string {
  if (!description) {
    return '(no description)';
  }
  const lines = description.split('\n');
  return lines[0] || description;
}

/**
 * Get description body (everything after first line)
 */
function getDescriptionBody(description: string | undefined): string | undefined {
  if (!description) {
    return undefined;
  }
  const lines = description.split('\n');
  if (lines.length <= 1) {
    return undefined;
  }
  return lines.slice(1).join('\n').trim();
}

export function formatTask(task: Task): string {
  const title = getTitle(task.description);
  const descriptionBody = getDescriptionBody(task.description);
  
  const lines = [
    `ID: ${task.id}`,
    `Title: ${title}`,
    `State: ${task.state}`,
    `Priority: ${task.priority}`,
  ];

  if (task.role) {
    lines.push(`Role: ${task.role}`);
  }

  if (descriptionBody) {
    lines.push(`Description: ${descriptionBody}`);
  }

  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`Dependencies: ${task.dependencies.join(', ')}`);
  }

  if (task.summary) {
    lines.push(`Summary: ${task.summary}`);
  }

  if (task.status) {
    lines.push(`Status: ${task.status}`);
  }

  if (task.testCommand) {
    lines.push(`Test Command: ${task.testCommand}`);
  }

  if (task.details) {
    lines.push(`Details: ${task.details}`);
  }

  if ('prNumber' in task && (task as any).prNumber) {
    lines.push(`PR Number: ${(task as any).prNumber}`);
  }

  if (task.prUrl) {
    lines.push(`PR URL: ${task.prUrl}`);
  }

  if ('prBranch' in task && (task as any).prBranch) {
    lines.push(`PR Branch: ${(task as any).prBranch}`);
  }

  if (task.sessionId) {
    lines.push(`Session ID: ${task.sessionId}`);
  }

  // Question section for awaiting_input tasks
  const hasQuestion = 'question' in task && (task as any).question;
  const hasContext = 'questionContext' in task && (task as any).questionContext;
  const hasResponse = 'humanResponse' in task && (task as any).humanResponse;

  if (hasQuestion || hasContext || hasResponse) {
    lines.push(''); // blank line for separation
    lines.push('=== AWAITING INPUT ===');
    
    if (hasQuestion) {
      lines.push(`Question: ${(task as any).question}`);
    }
    
    if (hasContext) {
      // Format multi-line context with indentation
      const contextLines = (task as any).questionContext.split('\n');
      lines.push('Context:');
      contextLines.forEach((line: string) => {
        lines.push(`  ${line}`);
      });
    }
    
    if (hasResponse) {
      // Format multi-line response with indentation
      const responseLines = (task as any).humanResponse.split('\n');
      lines.push('Response:');
      responseLines.forEach((line: string) => {
        lines.push(`  ${line}`);
      });
      
      if ('humanRespondedAt' in task && (task as any).humanRespondedAt) {
        lines.push(`Responded At: ${(task as any).humanRespondedAt}`);
      }
    }
    
    lines.push('='.repeat(21)); // closing separator
  }

  lines.push(`Created: ${task.createdAt}`);
  lines.push(`Updated: ${task.updatedAt}`);

  return lines.join('\n');
}

export function formatTaskList(tasks: Task[], showQuestion: boolean = false): string {
  if (tasks.length === 0) {
    return 'No tasks found';
  }

  const header = 'ID  | State       | Pri | Role       | Title';
  const separator = '-'.repeat(65);

  const rows: string[] = [];
  
  tasks.forEach(task => {
    const id = task.id.padEnd(3);
    const state = task.state.padEnd(11);
    const priority = task.priority.toString().padStart(3);
    const role = (task.role || '').padEnd(10);
    const title = getTitle(task.description);
    const truncatedTitle = title.length > 40 ? title.substring(0, 37) + '...' : title;

    rows.push(`${id} | ${state} | ${priority} | ${role} | ${truncatedTitle}`);
    
    // Add question line if present and showQuestion is true
    const taskQuestion = 'question' in task ? (task as any).question : undefined;
    if (showQuestion && taskQuestion) {
      rows.push(`    Question: ${taskQuestion}`);
    }
  });

  return [header, separator, ...rows].join('\n');
}
