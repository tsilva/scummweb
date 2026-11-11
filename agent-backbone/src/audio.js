// Installed before ScummVM/SDL creates its Web Audio graph, in every game frame.
// Keep the graph running while muted so audio timing cannot pause gameplay.
export function installAudioControl() {
  if (!globalThis.AudioNode) return;
  let enabled = false, updates = 0;
  const outputs = new Map();
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  function output(context) {
    if (!outputs.has(context)) {
      const gain = context.createGain();
      gain.gain.value = enabled ? 1 : 0;
      connect.call(gain, context.destination);
      outputs.set(context, gain);
    }
    return outputs.get(context);
  }
  AudioNode.prototype.connect = function (destination, ...args) {
    const target = destination === this.context.destination ? output(this.context) : destination;
    const result = connect.call(this, target, ...args);
    return result === target ? destination : result;
  };
  AudioNode.prototype.disconnect = function (...args) {
    if (args[0] === this.context.destination && outputs.has(this.context)) args[0] = outputs.get(this.context);
    return disconnect.apply(this, args);
  };
  globalThis.__agentscummSetSoundEnabled = value => {
    enabled = value === true;
    updates++;
    for (const [context, gain] of outputs) {
      if (context.state === 'closed') outputs.delete(context);
      else gain.gain.value = enabled ? 1 : 0;
    }
  };
  // Newly navigated frames inherit the current setting without an audible startup.
  const initialUpdate = updates;
  globalThis.__agentscummGetSoundEnabled().then(value => {
    if (updates === initialUpdate) globalThis.__agentscummSetSoundEnabled(value);
  }).catch(() => {});
}
