#!/usr/bin/env node

const HIVE_URL = process.env.HIVE_URL || 'https://beehive-v3.hector-ea.workers.dev';
const HIVE_API_KEY = process.env.HIVE_API_KEY;

if (!HIVE_API_KEY) {
    console.error('Error: HIVE_API_KEY environment variable required');
    process.exit(1);
}

async function request(path, method = 'GET', body) {
    const res = await fetch(`${HIVE_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HIVE_API_KEY}`
        },
        body: body ? JSON.stringify(body) : undefined
    });
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return await res.json();
}

const commands = {
    async agents(name) {
        const query = name ? `?name=${name}` : '';
        const data = await request(`/agents${query}`);
        console.log(name ? `Online agents visible to "${name}":` : 'All online agents:');
        data.agents.forEach(a => console.log(`  ${a}`));
    },

    async send(target, ...messageParts) {
        if (!target || messageParts.length === 0) {
            console.error('Usage: hive send <target> <message>');
            process.exit(1);
        }
        const message = messageParts.join(' ');
        const sender = process.env.HIVE_AGENT_NAME || 'cli';
        
        const data = await request('/send', 'POST', { target, text: message, sender });
        
        if (data.status === 'sent_to_group') {
            console.log(`✓ Broadcast to group "${target}" (${data.recipients?.length || 0} recipients)`);
        } else {
            console.log(`✓ Message sent to ${target}`);
        }
    },

    async tasks(filter) {
        const query = filter ? `?${filter}` : '';
        const data = await request(`/tasks${query}`);
        
        if (!data.tasks || data.tasks.length === 0) {
            console.log('No tasks found');
            return;
        }
        
        console.log(`Tasks (${data.tasks.length}):`);
        data.tasks.forEach(t => {
            const assignee = t.assignee ? ` @${t.assignee}` : '';
            console.log(`  [${t.id}] ${t.status.padEnd(12)} ${t.title}${assignee}`);
            if (t.body) console.log(`      ${t.body.substring(0, 60)}${t.body.length > 60 ? '...' : ''}`);
        });
    },

    async create(title, ...rest) {
        if (!title) {
            console.error('Usage: hive create <title> [assignee] [body...]');
            process.exit(1);
        }
        
        const assignee = rest[0] && !rest[0].includes(' ') ? rest.shift() : undefined;
        const body = rest.join(' ') || undefined;
        
        const data = await request('/tasks', 'POST', { title, assignee, body });
        console.log(`✓ Task created: ${data.id} - "${data.title}"`);
    },

    async update(id, field, ...valueParts) {
        if (!id || !field) {
            console.error('Usage: hive update <id> <field> <value>');
            console.error('Fields: status, assignee, title, body');
            process.exit(1);
        }
        
        const value = valueParts.join(' ');
        const updates = { [field]: value };
        
        const data = await request(`/tasks/${id}`, 'PATCH', updates);
        console.log(`✓ Task updated: ${data.id} - "${data.title}" (${field}=${value})`);
    },

    help() {
        console.log(`Hive CLI - Minimal agent coordination

Usage:
  hive agents                          List online agents
  hive send <target> <message>         Send message to agent or group
  hive tasks [filter]                  List tasks (filter: status=open, assignee=name)
  hive create <title> [assignee] [body]  Create task
  hive update <id> <field> <value>     Update task field

Environment:
  HIVE_URL        Hub URL (default: https://beehive-v3.hector-ea.workers.dev)
  HIVE_API_KEY    API key (required)
  HIVE_AGENT_NAME Agent name for send command (default: cli)

Examples:
  hive agents
  hive send explore "Work on Soundness.lean"
  hive send openlemma "New lemma added"
  hive tasks status=open
  hive tasks assignee=formalize
  hive create "Close sorrys" formalize "5 sorrys remaining"
  hive update a1b2 status done
`);
    }
};

// Main
const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    commands.help();
    process.exit(0);
}

if (!commands[cmd]) {
    console.error(`Unknown command: ${cmd}`);
    console.error('Run "hive help" for usage');
    process.exit(1);
}

commands[cmd](...args).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
