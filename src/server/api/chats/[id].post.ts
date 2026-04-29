import type { UIMessage } from 'ai'
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  smoothStream,
  stepCountIs,
  streamText
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { serverSupabaseClient } from '#supabase/server'

import { requireUserId } from '../../utils/auth'
import { requireCaseAccess } from '../../utils/cases'
import { extractTextFromParts, findChat, normalizeMessages, serializeMessages } from '../../utils/chats'
import { CitationRegistry, sanitizeMessageCitations } from '../../utils/citations'
import { createCaseTools } from '../../utils/chatTools'
import { buildSystemPromptFromCase } from '../../utils/chatPrompt'
import type { Database } from '~/types/database.types'

interface ChatRequestBody {
  messages?: UIMessage[]
}

/**
 * Streaming chat endpoint. Mirrors AIR-Bot's pattern with the Daylight twists:
 *   - cookie-based supabase client (RLS scopes by case ownership)
 *   - case-scoped tools (no cross-case leakage even via prompt)
 *   - citation post-validation: tools register every record id they return,
 *     and we strip any [type:id] tokens whose ids the agent invented.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'chat id is required' })

  const { messages } = await readBody<ChatRequestBody>(event)
  const submittedMessages = normalizeMessages(messages)
  if (submittedMessages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages are required' })
  }

  const runtimeConfig = useRuntimeConfig(event)
  const apiKey = runtimeConfig.openai?.apiKey
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OPENAI_API_KEY is not configured' })
  }

  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  const existingChat = await findChat(supabase, id)
  if (!existingChat) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })

  // RLS already enforces this, but the explicit check yields a cleaner 403.
  await requireCaseAccess(supabase, userId, existingChat.caseId)

  const openai = createOpenAI({ apiKey })
  const registry = new CitationRegistry()
  const tools = createCaseTools(supabase, existingChat.caseId, { registry, openaiApiKey: apiKey })
  const systemPrompt = await buildSystemPromptFromCase(supabase, existingChat.caseId, userId)

  const stream = createUIMessageStream({
    originalMessages: submittedMessages,
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai('gpt-5.4-mini'),
        system: systemPrompt,
        messages: await convertToModelMessages(submittedMessages),
        tools,
        stopWhen: stepCountIs(15),
        experimental_transform: smoothStream(),
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            reasoningSummary: 'detailed'
          } satisfies OpenAILanguageModelResponsesOptions
        }
      })

      writer.merge(result.toUIMessageStream({
        sendReasoning: true,
        sendSources: true
      }))
    },
    onFinish: async ({ messages: responseMessages }) => {
      const fresh = await findChat(supabase, id)
      if (!fresh) return

      const existingIds = new Set(fresh.messages.map(m => m.id))
      const newMessages = responseMessages.filter(m => !existingIds.has(m.id))
      if (newMessages.length === 0) return

      // Citation guardrail: strip any [event:<id>], [message:<id>], [journal:<id>]
      // tokens whose id the tools never actually returned this turn.
      const validIds = registry.asSet()
      const cleanedNew = newMessages.map(m => sanitizeMessageCitations(m, validIds))
      const updatedMessages = [...fresh.messages, ...cleanedNew]
      const updatedAt = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('chats')
        .update({
          messages: serializeMessages(updatedMessages),
          updated_at: updatedAt
        })
        .eq('id', id)

      if (updateError) {
        // eslint-disable-next-line no-console
        console.error('[chats/[id].post] persist failed:', updateError.message)
        return
      }

      // Auto-title from the first user turn once we have at least one assistant reply.
      if (fresh.title || !updatedMessages.some(m => m.role === 'assistant')) return
      const firstUser = updatedMessages.find(m => m.role === 'user')
      const firstUserText = firstUser ? extractTextFromParts(firstUser.parts) : ''
      if (!firstUserText) return

      try {
        const { text } = await generateText({
          model: openai('gpt-5.4-nano'),
          system: 'Generate a short chat title under 30 characters. Plain text only, no quotes or punctuation beyond normal words.',
          prompt: firstUserText
        })
        const title = text.trim().slice(0, 30)
        if (!title) return
        await supabase.from('chats').update({ title }).eq('id', id)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[chats/[id].post] title gen failed:', e)
      }
    }
  })

  return createUIMessageStreamResponse({ stream })
})
