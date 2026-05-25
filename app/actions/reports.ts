'use server'

import { z } from 'zod'
import { generateNssMarkdown } from '@/lib/reports/gemini'
import { parseNssMarkdown, buildReportFilename, fillNssReportTemplate } from '@/lib/reports/docx'

const DEFAULT_ACTIVITY_COORDINATOR = 'Prof. Rakshak Sood'
const DEFAULT_ORGANIZING_UNIT = 'NSS-VIT'

function extractEventType(rawMessage: string): string | undefined {
  const match = rawMessage.match(/Event\s*Type\s*[:\-]\s*(.+)/i)
  if (!match) return undefined
  return match[1].split('\n')[0].trim() || undefined
}

const inputSchema = z.object({
  rawMessage: z.string().min(1, 'Raw message is required'),
  majorObjective: z.string().trim()
    .min(10, 'Major objective must be at least 10 characters')
    .refine(
      (val) => val.split(/\s+/).filter(Boolean).length <= 500,
      'Major objective must be at most 500 words'
    ),
  scheme: z.string().trim().max(100).optional(),
  organizingUnit: z.string().trim().max(100).optional(),
  activityCoordinator: z.string().trim().max(100).optional(),
  apiKey: z.string().trim().optional(),
})

export async function generateNssReport(raw: unknown) {
  const input = inputSchema.parse(raw)

  const extractedEventType = extractEventType(input.rawMessage)
  const scheme = input.scheme || extractedEventType || 'NSS'
  const organizingUnit = input.organizingUnit || DEFAULT_ORGANIZING_UNIT
  const activityCoordinator = input.activityCoordinator || DEFAULT_ACTIVITY_COORDINATOR

  // Call Gemini to generate the markdown report from the raw message
  const markdown = await generateNssMarkdown({
    rawMessage: input.rawMessage,
    majorObjective: input.majorObjective,
    scheme,
    organizingUnit,
    activityCoordinator,
    apiKey: input.apiKey || undefined,
  })

  // Parse the markdown into structured pieces
  const parsed = parseNssMarkdown(markdown)
  return parsed
}

export async function downloadNssDocx(formData: FormData) {
  const parsedDataStr = formData.get('parsedData') as string
  const fallbackDateString = formData.get('fallbackDateString') as string
  const parsedData = JSON.parse(parsedDataStr)
  
  const photoDimensionsStr = formData.get('photoDimensions') as string
  const dimensions = photoDimensionsStr ? JSON.parse(photoDimensionsStr) : []

  const photoFiles = formData.getAll('photos') as File[]

  const MAX_HEIGHT = 150

  const photos = await Promise.all(
    photoFiles.map(async (file, index) => {
      const arrayBuffer = await file.arrayBuffer()
      const b64 = Buffer.from(arrayBuffer).toString('base64')

      const providedWidth = dimensions[index]?.width ?? 250
      const providedHeight = dimensions[index]?.height ?? 200

      const scale = providedHeight > MAX_HEIGHT ? (MAX_HEIGHT / providedHeight) : 1
      const width = Math.round(providedWidth * scale)
      const height = Math.round(providedHeight * scale)

      return {
        base64: b64,
        width,
        height
      }
    })
  )
  
  const buffer = await fillNssReportTemplate({
    activityTitle: parsedData.activityTitle,
    date: parsedData.eventDetails['Date'] || fallbackDateString,
    venue: parsedData.eventDetails['Venue'],
    time: parsedData.eventDetails['Time'],
    volunteers: parsedData.eventDetails['No. of Volunteers'],
    activityCoordinator: parsedData.eventDetails['Activity Coordinator'] || DEFAULT_ACTIVITY_COORDINATOR,
    scheme:
      parsedData.eventDetails['Name of Scheme'] ||
      parsedData.eventDetails['Event Type'] ||
      'NSS',
    organizingUnit: parsedData.eventDetails['Organizing Unit'] || DEFAULT_ORGANIZING_UNIT,
    objectives: parsedData.objectives,
    description: parsedData.description,
    impact: parsedData.impact,
    conclusion: parsedData.conclusion,
    photos: photos.length > 0 ? photos : undefined,
  })

  const fallbackDate = new Date(fallbackDateString)
  const validFallbackDate = isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate
  const filename = buildReportFilename(parsedData, validFallbackDate)

  return {
    filename,
    fileBase64: buffer.toString('base64'),
  }
}
