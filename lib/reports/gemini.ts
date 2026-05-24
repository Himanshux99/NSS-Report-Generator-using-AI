import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL_NAME = 'gemini-2.5-flash'
const PROMPT_PATH = join(process.cwd(), 'lib', 'reports', 'prompts', 'nss-report.txt')

let cachedPrompt: string | null = null

async function loadSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt
  cachedPrompt = await readFile(PROMPT_PATH, 'utf-8')
  return cachedPrompt
}

function getClient(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) {
    throw new Error('Gemini API key is not set. Please change the API key or input your own API key.')
  }
  return new GoogleGenerativeAI(key)
}

export interface NssReportInput {
  /** The raw WhatsApp message containing event details and attendees. */
  rawMessage: string
  /** The one-sentence major objective supplied by the user. */
  majorObjective: string
  /** Scheme string (e.g. "University"). */
  scheme: string
  /** Organizing unit string (e.g. "University"). */
  organizingUnit: string
  /** Activity Coordinator */
  activityCoordinator: string
  /** Custom Gemini API key (optional). */
  apiKey?: string
}

/** Primary model — falls back if it's overloaded. */
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash']

function isTransientGeminiError(err: unknown): boolean {
  const e = err as { status?: number; message?: string }
  if (e?.status === 503 || e?.status === 429 || e?.status === 500) return true
  const msg = (e?.message ?? '').toLowerCase()
  return msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand')
}

function isApiKeyError(err: unknown): boolean {
  const e = err as { status?: number; message?: string }
  const status = e?.status
  const msg = (e?.message ?? '').toLowerCase()
  
  if (status === 400 || status === 403 || status === 401) {
    if (
      msg.includes('key') ||
      msg.includes('api') ||
      msg.includes('expired') ||
      msg.includes('invalid') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden')
    ) {
      return true
    }
  }
  
  if (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('api key expired') ||
    (msg.includes('api key') && (msg.includes('invalid') || msg.includes('expire') || msg.includes('credential')))
  ) {
    return true
  }
  
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Call Gemini and return the raw markdown report content.
 * Extracts the ```md ... ``` fenced block from the response.
 * Retries on transient 503/429; falls back to older Flash models if
 * the primary model stays overloaded.
 */
export async function generateNssMarkdown(input: NssReportInput): Promise<string> {
  const systemInstruction = await loadSystemPrompt()
  const client = getClient(input.apiKey)
  const userMessage = [
    `Raw WhatsApp Message:`,
    input.rawMessage,
    ``,
    `Additional Provided Fields:`,
    `Major Objective: ${input.majorObjective}`,
    `Name of Scheme: ${input.scheme}`,
    `Organizing Unit: ${input.organizingUnit}`,
    `Activity Coordinator: ${input.activityCoordinator}`,
    ``,
    `INSTRUCTIONS FOR EXTRACTION:`,
    `1. If the exact Event Time is not explicitly mentioned but 'Reporting time' and 'Hours alloted' are provided, calculate the Event Time as follows:`,
    `   - Start Time = Reporting Time + 30 minutes.`,
    `   - End Time = Start Time + Hours alloted.`,
    `   Format the time like "9:00 am to 12:00 pm".`,
    `2. Accurately count the Male and Female volunteers from the list of names. Ensure the total matches the list provided, formatted as "X (Male:Y, Female:Z)".`,
    `3. Format the venue/location strictly as "(Area, City)", for example "(Andheri West, Mumbai)" or "(Wadala, Mumbai)". If the message says "Reporting Station: andheri", format it as "(Andheri, Mumbai)". Avoid vague descriptions.`
  ].join('\n')

  const modelsToTry = [MODEL_NAME, ...FALLBACK_MODELS]
  let lastErr: unknown

  for (const modelName of modelsToTry) {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction,
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain',
      },
    })

    // Retry up to 3 attempts per model with exponential backoff (1s, 2s, 4s).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await model.generateContent(userMessage)
        const text = result.response.text()
        const fence = text.match(/```(?:md|markdown)\s*([\s\S]*?)```/i)
        if (!fence) {
          throw new Error('Gemini response did not contain a ```md fenced block')
        }
        return fence[1].trim()
      } catch (err) {
        lastErr = err
        if (isApiKeyError(err)) {
          throw new Error('API key error: Please change the API key or input your own API key.')
        }
        if (!isTransientGeminiError(err)) throw err
        if (attempt < 2) await sleep(1000 * Math.pow(2, attempt))
      }
    }
    // All retries exhausted for this model — try next fallback.
  }

  throw new Error(
    'Gemini is overloaded right now. Please try again in a minute. ' +
      (lastErr instanceof Error ? `(${lastErr.message})` : '')
  )
}
