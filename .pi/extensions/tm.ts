import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { TaskManager } from "../../src/task-manager.js";
import { TaskStorage } from "../../src/storage.js";

/**
 * beehive interactive extension for pi
 * Provides human-in-the-loop tools and task state management.
 */
export default function(pi: ExtensionAPI) {
  const storage = new TaskStorage();
  const manager = new TaskManager(storage);

  let activeTaskId: string | null = null;

  const updateWidget = async (ctx: any) => {
    if (!activeTaskId) {
      ctx.ui.setWidget("tm-active", undefined);
      return;
    }

    try {
      const task = await manager.showTask(activeTaskId);
      ctx.ui.setWidget("tm-active", [
        `[beehive] Active Task: ${task.id} - ${task.title}`,
        `Status: ${task.status || 'Starting...'}`
      ]);
    } catch (e) {
      activeTaskId = null;
      ctx.ui.setWidget("tm-active", undefined);
    }
  };

  // Restore active task from session history
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "tm:active-task") {
        activeTaskId = entry.data.taskId;
      }
    }
    updateWidget(ctx);
  });

  pi.registerTool({
    name: "tm_update_status",
    label: "Update status",
    description: "Update the progress status message for the current task",
    parameters: Type.Object({
      status: Type.String({ description: "Short description of what you are doing right now" })
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!activeTaskId) return { content: [{ type: "text", text: "No active task" }], details: {} };
      await manager.updateTask(activeTaskId, { status: params.status });
      updateWidget(ctx);
      return { content: [{ type: "text", text: "Status updated" }], details: {} };
    }
  });

  pi.registerTool({
    name: "tm_request_feedback",
    label: "Ask user",
    description: "Pause work and ask the user for feedback, clarification, or review of a change",
    parameters: Type.Object({
      question: Type.String({ description: "What you want to ask the user" })
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      const response = await ctx.ui.input(`[Task Feedback] ${params.question}`, "Type your feedback here...");
      
      if (!response) {
        return { 
          content: [{ type: "text", text: "The user ignored the request. Continue based on your best judgment." }], 
          details: {} 
        };
      }

      return { 
        content: [{ type: "text", text: `User feedback: ${response}` }], 
        details: { response } 
      };
    }
  });

  pi.registerTool({
    name: "tm_finish_task",
    label: "Finish task",
    description: "Call this when you believe the task is complete. This will ask the user for final approval.",
    parameters: Type.Object({
      summary: Type.String({ description: "Brief summary of what was accomplished" }),
      details: Type.String({ description: "Detailed technical notes about the changes" })
    }),
    async execute(id, params, signal, onUpdate, ctx) {
      if (!activeTaskId) return { content: [{ type: "text", text: "No active task" }], details: {} };

      const satisfied = await ctx.ui.confirm(
        "Review Task", 
        `Agent wants to complete task ${activeTaskId}. Are you satisfied with the work?`
      );

      if (satisfied) {
        await manager.closeTask(activeTaskId, params.summary, params.details);
        ctx.ui.notify(`Task ${activeTaskId} completed!`, "success");
        const oldId = activeTaskId;
        activeTaskId = null;
        pi.appendEntry("tm:active-task", { taskId: null });
        updateWidget(ctx);
        return { content: [{ type: "text", text: "Task successfully closed." }], details: { closed: true, id: oldId } };
      } else {
        const feedback = await ctx.ui.input("Provide Feedback", "What still needs to be done?");
        return { 
          content: [{ type: "text", text: `Task NOT closed. The user requested further work: ${feedback || "No specific feedback provided."}` }], 
          details: { closed: false, feedback } 
        };
      }
    }
  });

  pi.registerCommand("tm-run", {
    description: "Run a beehive task interactively",
    handler: async (taskId, ctx) => {
      try {
        const task = taskId ? await manager.showTask(taskId) : await manager.getNextTask();
        if (!task) {
          ctx.ui.notify("No unblocked tasks found", "warning");
          return;
        }

        activeTaskId = task.id;
        await manager.claimTask(task.id);
        pi.appendEntry("tm:active-task", { taskId: task.id });
        updateWidget(ctx);

        let prompt = `# Task: ${task.title} (${task.id})\n\n`;
        if (task.description) prompt += `## Description\n${task.description}\n\n`;
        
        prompt += `### Working Instructions\n`;
        prompt += `1. Use \`tm_update_status\` to let the user know what you're doing.\n`;
        prompt += `2. Use \`tm_request_feedback\` if you need the user to look at something or make a choice.\n`;
        prompt += `3. Use \`tm_finish_task\` when you are done. The user will review your work and either close the task or give you follow-up feedback.\n`;

        await pi.sendUserMessage(prompt);
      } catch (error) {
        ctx.ui.notify(`Error: ${(error as Error).message}`, "error");
      }
    }
  });
}
