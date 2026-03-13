/**
 * ReAct Agent Executor
 * =====================
 * Provides a proper ReAct (Reason → Act → Observe) loop for tool-using agents.
 *
 * The previous implementation used llm.bindTools().invoke() which only made
 * a single LLM call — tool_calls were never executed and results never fed back.
 *
 * This module uses LangGraph's createReactAgent to ensure:
 *   1. LLM decides which tools to call
 *   2. Tools are executed and results are returned to the LLM
 *   3. LLM reasons about results and decides next action
 *   4. Loop continues until LLM produces a final text response
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM, AGENT_ROLES, getTodayString } from "../config.js";
import type { StructuredToolInterface } from "@langchain/core/tools";

export interface AgentConfig {
  model: string;
  role: keyof typeof AGENT_ROLES;
  tools: StructuredToolInterface[];
  maxIterations?: number;
}

/**
 * Build a ReAct agent with a proper tool-use loop.
 * Returns a compiled LangGraph that handles the full ReAct cycle.
 */
export function buildReactAgent(config: AgentConfig) {
  const { model, role, tools, maxIterations = 10 } = config;
  const roleConfig = AGENT_ROLES[role];
  const llm = createLLM({ model, temperature: 0.1 });

  const systemPrompt =
    `Today's date: ${getTodayString()}\n\n` +
    `You are a ${roleConfig.role}.\n\n` +
    `Goal: ${roleConfig.goal}\n\n` +
    `Background: ${roleConfig.backstory}\n\n` +
    `CRITICAL RULES:\n` +
    `1. ONLY use data returned by your tools. Do NOT fabricate, estimate, or infer data from training knowledge.\n` +
    `2. If a tool returns no data or fails, explicitly state that the information is unavailable.\n` +
    `3. When citing numbers, they MUST come from tool results. Never invent financial figures, prices, or statistics.\n` +
    `4. Always cite the source of your data.\n` +
    `5. If you lack sufficient data for a section, say so honestly rather than filling it with generic content.\n` +
    `6. You have access to tools — USE THEM to gather real data before answering.\n` +
    `7. Do NOT produce your final answer until you have called at least one relevant tool.`;

  return createReactAgent({
    llm,
    tools,
    stateModifier: new SystemMessage(systemPrompt),
  });
}

/**
 * Run a ReAct agent and return the final text response.
 * The agent will autonomously call tools and reason about results
 * until it produces a final answer.
 */
export async function runReactAgent(
  agent: ReturnType<typeof buildReactAgent>,
  userMessage: string,
): Promise<string> {
  const result = await agent.invoke({
    messages: [new HumanMessage(userMessage)],
  });

  // Extract the final text response (last AI message without tool_calls)
  const messages = result.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg._getType() === "ai") {
      // Check for tool_calls via additional_kwargs (type-safe access)
      const toolCalls = (msg as any).tool_calls;
      if (!toolCalls?.length) {
        return typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      }
    }
  }

  // Fallback: return the last message content
  const lastMsg = messages[messages.length - 1];
  return typeof lastMsg.content === "string"
    ? lastMsg.content
    : JSON.stringify(lastMsg.content);
}
