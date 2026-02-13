import { Task } from '../types.js';

export function compareTasks(a: Task, b: Task): number {
  // System tasks always come first
  const aIsSystem = 'isSystem' in a && (a as any).isSystem;
  const bIsSystem = 'isSystem' in b && (b as any).isSystem;
  if (aIsSystem !== bIsSystem) {
    return aIsSystem ? -1 : 1;
  }

  // Priority ascending (0 is critical, 4 is backlog)
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  // Creation order (older tasks first)
  return a.createdAt.localeCompare(b.createdAt);
}
