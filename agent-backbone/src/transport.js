import { z } from 'zod';

// Private stdio transport for the ScummWEB backbone. ScummBench exposes the
// public MCP endpoint and owns its journal. No agent-side code is loaded here.
const protocols = ['2024-11-05', '2025-03-26', '2025-06-18'];
const maxLineBytes = 24 * 1024 * 1024;

export class BackboneServer {
  constructor(serverInfo, { instructions }) {
    this.serverInfo = serverInfo;
    this.instructions = instructions;
    this.tools = new Map();
    this.active = new Map();
    this.initialized = false;
    this.closed = false;
  }

  registerTool(name, { inputSchema, ...metadata }, callback) {
    if (this.tools.has(name)) throw new Error('Duplicate backbone tool');
    const schema = inputSchema instanceof z.ZodType ? inputSchema : z.strictObject(inputSchema);
    this.tools.set(name, { schema, callback, descriptor: {
      name, ...metadata, inputSchema: z.toJSONSchema(schema, { io: 'input' }),
    } });
  }

  send(value) {
    if (!this.closed) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
  }

  async handle(request) {
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string'
      || (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number')) {
      this.send({ id: null, error: { code: -32600, message: 'Invalid request' } });
      return;
    }
    const { id, method, params = {} } = request;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      if (id !== undefined) this.send({ id, error: { code: -32602, message: 'Invalid parameters' } });
      return;
    }
    if (method === 'notifications/cancelled') {
      this.active.get(params.requestId)?.abort();
      return;
    }
    if (id === undefined) return;
    if (this.active.has(id)) {
      this.send({ id, error: { code: -32600, message: 'Duplicate request ID' } });
      return;
    }
    const controller = new AbortController();
    this.active.set(id, controller);
    try {
      let result;
      if (method === 'initialize') {
        if (this.initialized || !protocols.includes(params.protocolVersion)) {
          this.send({ id, error: { code: -32602, message: 'Unsupported initialization' } });
          return;
        }
        this.initialized = true;
        result = { protocolVersion: params.protocolVersion, capabilities: { tools: {} },
          serverInfo: this.serverInfo, instructions: this.instructions };
      } else if (!this.initialized) {
        this.send({ id, error: { code: -32000, message: 'Initialize first' } });
        return;
      } else if (method === 'ping') result = {};
      else if (method === 'tools/list') result = { tools: [...this.tools.values()].map(tool => tool.descriptor) };
      else if (method === 'tools/call') {
        const tool = this.tools.get(params.name);
        const args = tool?.schema.safeParse(params.arguments ?? {});
        if (!args?.success) {
          this.send({ id, error: { code: -32602, message: 'Invalid tool or arguments' } });
          return;
        }
        result = await tool.callback(args.data, { signal: controller.signal });
      } else {
        this.send({ id, error: { code: -32601, message: 'Unsupported method' } });
        return;
      }
      this.send({ id, result });
    } catch {
      this.send({ id, error: { code: -32603, message: 'Backbone request failed' } });
    } finally {
      this.active.delete(id);
    }
  }

  connect() {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    this.onData = chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > maxLineBytes) {
        this.send({ id: null, error: { code: -32600, message: 'Request exceeds input limit' } });
        process.stdin.destroy();
        void this.close();
        return;
      }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let request;
        try { request = JSON.parse(line); }
        catch { this.send({ id: null, error: { code: -32700, message: 'Invalid JSON' } }); continue; }
        void this.handle(request);
      }
    };
    process.stdin.on('data', this.onData);
  }

  async close() {
    this.closed = true;
    process.stdin.off('data', this.onData);
    process.stdin.pause();
    for (const controller of this.active.values()) controller.abort();
  }
}
