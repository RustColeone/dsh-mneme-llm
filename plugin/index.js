// DeepSeek Harness plugin: her memory file and her gut for your companion (see hooks.js and README.md).
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createAssistantMessage, createSystemMessage, createUserMessage, isAgentLoopRequest }
  from '@deepseek-ai/dsh-llm'
import { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { hooks } from './hooks.js'

export const name = 'mneme-llm'
export const inject = ['agents', 'llm', 'sessionProjections', 'systemPrompt']

export function apply (ctx, config = {}) {
  hooks(ctx, config, { createUserMessage, createAssistantMessage, createSystemMessage, renderPrompt,
    isAgentLoopRequest, home: resolveDshHome() })
}
