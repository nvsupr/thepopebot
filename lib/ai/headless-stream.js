import { Transform } from 'stream';
import split2 from 'split2';

/**
 * Parse Docker container logs from a headless Claude Code container
 * running with --output-format stream-json.
 *
 * Three layers:
 * 1. Docker multiplexed frame decoder (Transform stream)
 * 2. split2 for reliable NDJSON line splitting
 * 3. Claude Code stream-json → chat event mapper
 *
 * @param {import('http').IncomingMessage} dockerLogStream - Raw Docker log stream
 * @yields {{ type: string, text?: string, toolCallId?: string, toolName?: string, args?: object, result?: string }}
 */
export async function* parseHeadlessStream(dockerLogStream) {
  // Layer 1: Docker frame decoder
  const frameDecoder = new Transform({
    transform(chunk, encoding, callback) {
      this._buf = this._buf ? Buffer.concat([this._buf, chunk]) : chunk;
      while (this._buf.length >= 8) {
        const size = this._buf.readUInt32BE(4);
        if (this._buf.length < 8 + size) break;
        if (this._buf[0] === 1) { // stdout only
          this.push(this._buf.slice(8, 8 + size));
        }
        this._buf = this._buf.slice(8 + size);
      }
      callback();
    }
  });

  // Layer 2: split2 for reliable line splitting
  const lines = dockerLogStream.pipe(frameDecoder).pipe(split2());

  // Layer 3: map each complete line to chat events
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const event of mapLine(trimmed)) {
      yield event;
    }
  }
}

/**
 * Map a single line from Claude Code stream-json to chat events.
 * @param {string} line
 * @returns {Array<object>} Zero or more chat events
 */
export function mapLine(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.warn('[headless-stream] JSON parse failed, length:', line.length, 'preview:', line.slice(0, 120));
    // Non-JSON lines (NO_CHANGES, MERGE_SUCCESS, AGENT_FAILED, etc.)
    return [{ type: 'text', text: `\n${line}\n` }];
  }

  const events = [];
  const { type, message, result, tool_use_result } = parsed;

  if (type === 'assistant' && message?.content) {
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        events.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        events.push({
          type: 'tool-call',
          toolCallId: block.id,
          toolName: block.name,
          args: block.input,
        });
      }
    }
  } else if (type === 'user' && message?.content) {
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        const resultText = tool_use_result?.stdout ?? (
          typeof block.content === 'string' ? block.content :
          Array.isArray(block.content) ? block.content.map(b => b.text || '').join('') :
          JSON.stringify(block.content)
        );
        events.push({
          type: 'tool-result',
          toolCallId: block.tool_use_id,
          result: resultText,
        });
      }
    }
  } else if (type === 'result' && result) {
    events.push({ type: 'text', text: result, _resultSummary: result });
  }
  // Skip system init messages and other unknown types

  return events;
}
