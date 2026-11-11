import { z } from 'zod';
import { BackboneServer } from '../src/transport.js';
const server = new BackboneServer({ name: 'synthetic-backbone', version: '1' }, { instructions: 'Synthetic controls only' });
server.registerTool('echo', { description: 'Synthetic echo', inputSchema: { value: z.number().int().min(0).default(0) } },
  async args => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }));
server.registerTool('wait', { inputSchema: {} }, async (_, { signal }) => {
  await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
  return { isError: true, content: [{ type: 'text', text: 'cancelled' }] };
});
process.stdin.once('end', () => { void server.close(); });
await server.connect();
