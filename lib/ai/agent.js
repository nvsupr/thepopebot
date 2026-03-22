import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { createModel } from './model.js';
import { createJobTool, getJobStatusTool, planPopebotUpdatesTool, createStartHeadlessCodingTool } from './tools.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { jobPlanningMd, codePlanningMd, thepopebotDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';
import { createWebSearchTool, getProvider } from './web-search.js';

// Singletons on globalThis to survive Next.js webpack chunk duplication.
// Server actions and route handlers may be bundled into separate chunks, each
// with their own copy of module-level variables. globalThis is shared across all chunks.

export function setCurrentCodeModeType(mode) { globalThis.__popebotCodeModeType = mode; }
export function getCurrentCodeModeType() { return globalThis.__popebotCodeModeType ?? 'plan'; }

/**
 * Get or create the LangGraph job agent singleton.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 */
export async function getChatAgent() {
  if (!globalThis.__popebotChatAgent) {
    const model = await createModel();
    const tools = [createJobTool, getJobStatusTool, planPopebotUpdatesTool];

    const webSearchTool = await createWebSearchTool();
    if (webSearchTool) {
      tools.push(webSearchTool);
      console.log(`[agent] Web search enabled (provider: ${getProvider()})`);
    }

    const checkpointer = SqliteSaver.fromConnString(thepopebotDb);

    globalThis.__popebotChatAgent = createReactAgent({
      llm: model,
      tools,
      checkpointSaver: checkpointer,
      prompt: (state) => [new SystemMessage(render_md(jobPlanningMd)), ...state.messages],
    });
  }
  return globalThis.__popebotChatAgent;
}

/**
 * Reset all agent singletons (e.g., when config changes).
 */
export function resetChatAgent() {
  globalThis.__popebotChatAgent = null;
  _codeAgents.clear();
}

const _codeAgents = (globalThis.__popebotCodeAgents ??= new Map());

/**
 * Get or create a code agent for a specific chat/workspace.
 * Each code chat gets its own agent with unique start_coding tool bindings.
 * @param {object} context
 * @param {string} context.repo - GitHub repo
 * @param {string} context.branch - Git branch
 * @param {string} context.workspaceId - Pre-created workspace row ID
 * @param {string} context.chatId - Chat thread ID
 * @returns {Promise<object>} LangGraph agent
 */
export async function getCodeAgent({ repo, branch, workspaceId, chatId }) {
  const key = `${repo}_${branch}_${workspaceId}`;
  if (_codeAgents.has(key)) {
    return _codeAgents.get(key);
  }

  const model = await createModel();
  const startHeadlessCodingTool = createStartHeadlessCodingTool({ repo, branch, workspaceId });

  const tools = [startHeadlessCodingTool];

  const webSearchTool = await createWebSearchTool();
  if (webSearchTool) {
    tools.push(webSearchTool);
    console.log(`[agent] Web search enabled for code agent (provider: ${getProvider()})`);
  }

  const checkpointer = SqliteSaver.fromConnString(thepopebotDb);

  const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
    prompt: (state) => [new SystemMessage(render_md(codePlanningMd)), ...state.messages],
  });

  _codeAgents.set(key, agent);
  return agent;
}
