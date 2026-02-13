import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Hive Bridge - Pi Extension for Hive v3
 * 
 * Zero config files. Env vars for connection, commands for identity.
 */
export default (pi: ExtensionAPI) => {
    const HUB_URL = process.env.HIVE_URL || 'https://beehive-v3.hector-ea.workers.dev';
    const API_KEY = process.env.HIVE_API_KEY;
    const POLL_INTERVAL = parseInt(process.env.HIVE_POLL_INTERVAL_MS || '3000');
    const REGISTRY_PATH = join(homedir(), '.pi', 'agent', 'hive-registry.yaml');
    
    let YAML: any;
    try {
        const piPath = execSync('which pi').toString().trim();
        const piDir = dirname(dirname(realpathSync(piPath)));
        const yamlPath = join(piDir, 'node_modules', 'yaml', 'dist', 'index.js');
        if (existsSync(yamlPath)) YAML = require(yamlPath);
    } catch (e) {}

    let myName: string | null = null;
    let pollInterval: any = null;

    if (!API_KEY) {
        console.error('[Hive] HIVE_API_KEY environment variable required');
        return;
    }

    // --- REGISTRY HELPERS (for agent name persistence) ---
    const loadRegistry = () => {
        if (!existsSync(REGISTRY_PATH)) return { agents: {} };
        try {
            const content = readFileSync(REGISTRY_PATH, 'utf8');
            return YAML ? YAML.parse(content) : JSON.parse(content);
        } catch (e) { return { agents: {} }; }
    };

    // --- HUB API ---
    const hubRequest = async (path: string, method = 'GET', body?: any) => {
        try {
            const res = await fetch(`${HUB_URL}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    };

    const startPolling = (name: string) => {
        if (pollInterval) clearInterval(pollInterval);
        
        hubRequest('/register', 'POST', { name });
        
        pollInterval = setInterval(async () => {
            const data = await hubRequest(`/messages/${name}`);
            if (data && data.messages) {
                for (const msg of data.messages) {
                    let prefix = msg.sender ? `[From: ${msg.sender}] ` : "";
                    if (msg.group) {
                        prefix = `[Group: ${msg.group}] [From: ${msg.sender}] `;
                        if (Array.isArray(msg.recipients)) {
                            prefix += `(To: ${msg.recipients.join(', ')}) `;
                        }
                    }
                    pi.sendUserMessage(`${prefix}${msg.text}`, { deliverAs: 'followUp' } as any);
                }
            }
        }, POLL_INTERVAL);
    };

    // --- TOOLS ---
    pi.registerTool({
        name: "hive_send",
        label: "Hive Send Message",
        description: "Sends a message to another agent or broadcasts to a group.",
        parameters: Type.Object({
            target: Type.String({ description: "Agent name or group name" }),
            message: Type.String({ description: "Message text" })
        }),
        async execute(id, params) {
            const data = await hubRequest('/send', 'POST', {
                target: params.target,
                text: params.message,
                sender: myName
            });

            if (!data) return { content: [{ type: "text", text: "Error: Hive hub unreachable." }], isError: true };

            const status = data.status === 'sent_to_group'
                ? `Message broadcast to group "${params.target}" (${data.recipients?.join(', ') || 'no recipients online'}).`
                : `Message sent to ${params.target}.`;

            return { content: [{ type: "text", text: status }] };
        }
    });

    pi.registerTool({
        name: "hive_list_agents",
        label: "Hive List Agents",
        description: "Lists all currently online agents.",
        parameters: Type.Object({}),
        async execute() {
            const data = await hubRequest('/agents');
            if (!data) return { content: [{ type: "text", text: "Error: Hive hub unreachable." }], isError: true };

            const list = data.agents.map((a: string) => a === myName ? `${a} (you)` : a);
            const text = `Online agents: ${list.join(', ') || 'none'}`;
            
            return { content: [{ type: "text", text }] };
        }
    });

    pi.registerTool({
        name: "hive_task_list",
        label: "Hive List Tasks",
        description: "Lists tasks with optional filters.",
        parameters: Type.Object({
            status: Type.Optional(Type.String({ description: "Filter by status" })),
            assignee: Type.Optional(Type.String({ description: "Filter by assignee" }))
        }),
        async execute(id, params) {
            const query = new URLSearchParams();
            if (params.status) query.set('status', params.status);
            if (params.assignee) query.set('assignee', params.assignee);
            
            const queryStr = query.toString() ? `?${query.toString()}` : '';
            const data = await hubRequest(`/tasks${queryStr}`);
            
            if (!data) return { content: [{ type: "text", text: "Error: Hive hub unreachable." }], isError: true };
            
            if (!data.tasks || data.tasks.length === 0) {
                return { content: [{ type: "text", text: "No tasks found." }] };
            }
            
            const text = JSON.stringify(data.tasks, null, 2);
            return { content: [{ type: "text", text }] };
        }
    });

    pi.registerTool({
        name: "hive_task_create",
        label: "Hive Create Task",
        description: "Creates a new task.",
        parameters: Type.Object({
            title: Type.String({ description: "Task title" }),
            assignee: Type.Optional(Type.String({ description: "Assignee agent name" })),
            body: Type.Optional(Type.String({ description: "Task details" }))
        }),
        async execute(id, params) {
            const data = await hubRequest('/tasks', 'POST', {
                title: params.title,
                assignee: params.assignee,
                body: params.body
            });
            
            if (!data) return { content: [{ type: "text", text: "Error: Hive hub unreachable." }], isError: true };
            
            const text = `Task created: ${data.id} - "${data.title}" (status: ${data.status})`;
            return { content: [{ type: "text", text }] };
        }
    });

    pi.registerTool({
        name: "hive_task_update",
        label: "Hive Update Task",
        description: "Updates an existing task.",
        parameters: Type.Object({
            id: Type.String({ description: "Task ID" }),
            status: Type.Optional(Type.String({ description: "New status" })),
            assignee: Type.Optional(Type.String({ description: "New assignee" })),
            title: Type.Optional(Type.String({ description: "New title" })),
            body: Type.Optional(Type.String({ description: "New body" }))
        }),
        async execute(id, params) {
            const updates: any = {};
            if (params.status) updates.status = params.status;
            if (params.assignee) updates.assignee = params.assignee;
            if (params.title) updates.title = params.title;
            if (params.body) updates.body = params.body;
            
            const data = await hubRequest(`/tasks/${params.id}`, 'PATCH', updates);
            
            if (!data) return { content: [{ type: "text", text: "Error: Hive hub unreachable." }], isError: true };
            
            const text = `Task updated: ${data.id} - "${data.title}" (status: ${data.status}, assignee: ${data.assignee || 'none'})`;
            return { content: [{ type: "text", text }] };
        }
    });

    // --- COMMANDS ---
    pi.registerCommand("register-agent", {
        description: "Register current session as a named agent",
        handler: async (args, ctx) => {
            const name = args.trim();
            if (!name) return ctx.ui.notify("Error: Name required.", "error");

            const currentPath = ctx.sessionManager.getSessionFile();
            if (!currentPath) return ctx.ui.notify("Error: No session file found.", "error");

            const registry = loadRegistry();
            registry.agents[name] = { path: realpathSync(currentPath), cwd: process.cwd() };
            
            try {
                const content = YAML ? YAML.stringify(registry) : JSON.stringify(registry, null, 2);
                writeFileSync(REGISTRY_PATH, content);
            } catch (e) {}

            myName = name;
            startPolling(name);
            ctx.ui.notify(`Agent registered as "${name}". Polling started.`, "success");
        }
    });

    pi.registerCommand("join-group", {
        description: "Join a group for broadcast messaging",
        handler: async (args, ctx) => {
            const group = args.trim();
            if (!group) return ctx.ui.notify("Error: Group name required.", "error");
            if (!myName) return ctx.ui.notify("Error: Register agent first with /register-agent", "error");

            const data = await hubRequest('/join', 'POST', { name: myName, group });
            
            if (!data) return ctx.ui.notify("Error: Failed to join group.", "error");
            
            ctx.ui.notify(`Joined group "${group}"`, "success");
        }
    });

    // --- STARTUP ---
    pi.on('session_start', (event, ctx) => {
        const sessionFile = ctx.sessionManager.getSessionFile();
        if (!sessionFile) return;
        
        const absolutePath = realpathSync(sessionFile);
        const registry = loadRegistry();

        for (const [name, config] of Object.entries(registry.agents || {})) {
            if ((config as any).path === absolutePath) {
                myName = name;
                startPolling(name);
                console.log(`[Hive] Agent "${myName}" connected to ${HUB_URL}`);
                break;
            }
        }
    });

    // --- CLEANUP ---
    process.on('exit', () => {
        if (pollInterval) clearInterval(pollInterval);
    });
};
