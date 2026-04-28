import type { UIMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type ChatRole = 'user' | 'assistant'

type JsonValue
  = | string
    | number
    | boolean
    | null
    | { [key: string]: JsonValue | undefined }
    | JsonValue[]

export interface LegacyChatMessage {
  id: string
  role: ChatRole
  content: string
}

export type PersistedChatMessage = UIMessage | LegacyChatMessage

export interface Chat {
  id: string
  caseId: string
  userId: string
  title: string
  agent: string
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

interface ChatRow {
  id: string
  case_id: string
  user_id: string
  title: string | null
  agent: string | null
  messages: unknown
  created_at: string | null
  updated_at: string | null
}

type Client = SupabaseClient<Database>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant'
}

export function createTextMessage(role: ChatRole, text: string, id?: string): UIMessage {
  return {
    id: (id ?? crypto.randomUUID()) as UIMessage['id'],
    role,
    parts: [{ type: 'text', text }]
  }
}

export function extractTextFromParts(parts: UIMessage['parts'] | unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((part): part is { type: 'text', text: string } => {
      return isRecord(part) && part.type === 'text' && typeof part.text === 'string'
    })
    .map(part => part.text)
    .join('\n\n')
    .trim()
}

function normalizeMessage(message: unknown): UIMessage | null {
  if (!isRecord(message) || !isChatRole(message.role)) return null
  const id = typeof message.id === 'string' ? message.id : crypto.randomUUID()

  if (Array.isArray(message.parts)) {
    return { ...message, id, role: message.role, parts: message.parts } as UIMessage
  }

  if (typeof message.content === 'string') {
    return createTextMessage(message.role, message.content, id)
  }

  return null
}

export function normalizeMessages(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) return []
  return messages
    .map(normalizeMessage)
    .filter((message): message is UIMessage => message !== null)
}

export function serializeMessages(messages: PersistedChatMessage[] | UIMessage[]): JsonValue[] {
  return normalizeMessages(messages) as unknown as JsonValue[]
}

function mapChatRow(row: ChatRow): Chat {
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    title: row.title ?? '',
    agent: row.agent ?? 'case_assistant',
    messages: normalizeMessages(row.messages),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString()
  }
}

/**
 * Read every chat the active user can see for a given case, newest first.
 * RLS already restricts to chats whose case the user owns.
 */
export async function readChatsForCase(client: Client, caseId: string): Promise<Chat[]> {
  const { data, error } = await client
    .from('chats')
    .select('id, case_id, user_id, title, agent, messages, created_at, updated_at')
    .eq('case_id', caseId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, message: `Failed to load chats: ${error.message}` })
  }

  return (data ?? []).map(row => mapChatRow(row as ChatRow))
}

export async function findChat(client: Client, id: string): Promise<Chat | undefined> {
  const { data, error } = await client
    .from('chats')
    .select('id, case_id, user_id, title, agent, messages, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, message: `Failed to load chat: ${error.message}` })
  }

  return data ? mapChatRow(data as ChatRow) : undefined
}

export async function deleteChat(client: Client, id: string): Promise<boolean> {
  const { data, error } = await client
    .from('chats')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, message: `Failed to delete chat: ${error.message}` })
  }

  return Boolean(data)
}
