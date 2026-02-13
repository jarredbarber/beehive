export interface FollowUpTask {
  title: string;
  role: string;
  priority: number;
  dependencies?: string[];
}

export interface AgentResult {
  status: 'completed' | 'failed' | 'blocked';
  summary: string;
  details?: string;
  followUps?: FollowUpTask[];
  error?: string;
}

export function parseAgentResponse(output: string): AgentResult {
  // Try to find JSON completion block
  const match = output.match(/```json\n([\s\S]*?)\n```/);
  
  if (!match) {
    throw new Error('No JSON completion block found in agent output');
  }
  
  try {
    const parsed = JSON.parse(match[1]);
    
    // Validate required fields
    if (!parsed.status) {
      throw new Error('Missing required field: status');
    }
    
    if (parsed.status === 'completed' && !parsed.summary) {
      throw new Error('Completed tasks must have a summary');
    }
    
    if (parsed.status === 'failed' && !parsed.error) {
      throw new Error('Failed tasks must have an error message');
    }
    
    return parsed as AgentResult;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to parse JSON')) {
       throw err;
    }
    throw new Error(`Failed to parse JSON completion block: ${(err as Error).message}`);
  }
}

/**
 * Try to extract work-was-done signal even if JSON parsing fails
 */
export function detectWorkCompleted(output: string): boolean {
  const indicators = [
    /committed/i,
    /pushed/i,
    /created PR/i,
    /pull request/i,
    /✅/,
    /completed/i
  ];
  
  return indicators.some(pattern => pattern.test(output));
}
