// DeepSeek Harness plugin: mneme-llm's memory file and her gut for your companion (see hooks.js and README.md).
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { hooks } from './hooks.js'

export const name = 'mneme-llm'
export const inject = ['agents', 'llm', 'sessionProjections']

export function apply (ctx, config = {}) {
  hooks(ctx, config, { createUserMessage, createAssistantMessage, home: resolveDshHome() })
}
