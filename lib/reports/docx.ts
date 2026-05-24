import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { readFileSync } from 'node:fs'
// @ts-ignore
import ImageModule from 'docxtemplater-image-module-free'

const TEMPLATE_PATH = join(process.cwd(), 'lib', 'reports', 'templates', 'nss-report.docx')

let cachedTemplate: Buffer | null = null

async function loadTemplate(): Promise<Buffer> {
  if (cachedTemplate) return cachedTemplate
  cachedTemplate = await readFile(TEMPLATE_PATH)
  return cachedTemplate
}

export interface ParsedNssMarkdown {
  eventDetails: Record<string, string>
  objectives: string[]
  description: string
  impact: string
  conclusion: string
  activityTitle: string
}

/** Parse the markdown output from Gemini into structured pieces. */
export function parseNssMarkdown(md: string): ParsedNssMarkdown {
  const eventDetails: Record<string, string> = {}
  let objectives: string[] = []
  let description = ''
  let impact = ''
  let conclusion = ''
  let activityTitle = ''
  
  // --- Event details table: lines of form "| key | value |" ---
  const tableRowRe = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm
  let m: RegExpExecArray | null
  while ((m = tableRowRe.exec(md)) !== null) {
    const key = m[1].trim()
    const value = m[2].trim()
    // Skip separator rows like "|------|------|"
    if (/^[-:\s|]+$/.test(key) || /^[-:\s|]+$/.test(value)) continue
    eventDetails[key] = value
  }
  activityTitle = eventDetails['Activity Title'] ?? ''

  // --- Sections: "#### NAME" blocks. Match up to next "####" or end of input. ---
  const sectionRe = /^####\s+([A-Z ][A-Z ]*?)\s*$([\s\S]*?)(?=^####\s|$(?![\s\S]))/gm
  let sec: RegExpExecArray | null
  while ((sec = sectionRe.exec(md)) !== null) {
    const name = sec[1].trim().toUpperCase()
    const body = sec[2].trim()
    if (name === 'EVENT DETAILS') continue // already captured from table
    if (name === 'OBJECTIVES') {
      objectives = body
        .split('\n')
        .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
        .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l))
    } else if (name === 'DESCRIPTION') {
      description = body
    } else if (name === 'IMPACT') {
      impact = body
    } else if (name === 'CONCLUSION') {
      conclusion = body.split(/^(?:---|# PHOTOS)/m)[0].trim()
    }
  }

  return { eventDetails, objectives, description, impact, conclusion, activityTitle }
}

/** Slugify a string for use in a filename. */
function slugifyForFile(s: string): string {
  return s
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

/**
 * Produce "DD-MM-YYYY_EventTitle_Report.docx" from the parsed data.
 * Falls back to provided startDate if the LLM's Date string can't be parsed.
 */
export function buildReportFilename(parsed: ParsedNssMarkdown, fallbackStart: Date): string {
  const title = slugifyForFile(parsed.activityTitle || 'NSS_Report')
  const dateStr = parsed.eventDetails['Date']
  let dd = fallbackStart.getDate().toString().padStart(2, '0')
  let mm = (fallbackStart.getMonth() + 1).toString().padStart(2, '0')
  let yyyy = fallbackStart.getFullYear().toString()

  if (dateStr) {
    // Try "Saturday, 15th March 2026" style — strip weekday + ordinal suffix
    const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, '').replace(/(\d+)(st|nd|rd|th)/i, '$1')
    const parsedDate = new Date(cleaned)
    if (!Number.isNaN(parsedDate.getTime())) {
      dd = parsedDate.getDate().toString().padStart(2, '0')
      mm = (parsedDate.getMonth() + 1).toString().padStart(2, '0')
      yyyy = parsedDate.getFullYear().toString()
    }
  }

  return `${dd}-${mm}-${yyyy}_${title}_Report.docx`
}

export interface PhotoData {
  base64: string
  width: number
  height: number
}

export interface FillTemplateInput {
  activityTitle: string
  date: string
  venue: string
  time: string
  volunteers: string
  activityCoordinator: string
  scheme: string
  organizingUnit: string
  objectives: string[]
  description: string
  impact: string
  conclusion: string
  photos?: PhotoData[]
}

/** Fill the NSS template.docx with structured values. Returns a Buffer. */
export async function fillNssReportTemplate(input: FillTemplateInput): Promise<Buffer> {

  const templateBuffer = readFileSync(TEMPLATE_PATH)
  const zip = new PizZip(templateBuffer)

  // Only do XML manipulation when we actually have photos.
  // When photos=[], let docxtemplater handle {#photos}...{/photos} natively with an empty array.
  if (input.photos && input.photos.length > 0) {
    let docXml = zip.file('word/document.xml')?.asText()
    if (docXml) {
      // Build isolated per-image run tags: each {%imgN} in its own <w:t> so Word doesn't swallow them
      const imgTags = input.photos.map((_, i) =>
        `</w:t></w:r><w:r><w:t xml:space="preserve">{%img${i}}</w:t></w:r><w:r><w:t xml:space="preserve"> `
      ).join('');

      if (docXml.includes('{insert_photos}')) {
        // Simple placeholder format
        docXml = docXml.replace('{insert_photos}', imgTags);
        zip.file('word/document.xml', docXml);
      } else if (docXml.includes('#photos') && docXml.includes('%image')) {
        // The loop-style format: strip the loop container tags (which may be split across runs)
        // and replace %image with our per-image isolated tags
        docXml = docXml
          .replace(/\{#photos\}/g, '')
          .replace(/\{\/photos\}/g, '')
          .replace(/\{%image\}/g, imgTags);
        zip.file('word/document.xml', docXml);
      } else {
        // No recognized photo placeholder found in template
      }
    }
  } else {
  }

  // Build a lookup map to safely find dimensions for base64 values
  const sizeMap = new Map<string, {width: number, height: number}>();
  input.photos?.forEach(p => {
    sizeMap.set(p.base64, { width: p.width, height: p.height });
  });

  const imageModule = new ImageModule({
    centered: false,
    getImage: function(tagValue: string) {
      return Buffer.from(tagValue, 'base64')
    },
    getSize: function(img: any, tagValue: string, _tagName: string) {
      const size = sizeMap.get(tagValue);
      const result: [number, number] = size ? [size.width, size.height] : [250, 200];
      return result;
    }
  })

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
    modules: [imageModule]
  })

  const objectivesText = input.objectives.map((o) => `• ${o}`).join('\n')

  const renderData: any = {
    activityTitle: input.activityTitle,
    date: input.date,
    venue: input.venue,
    time: input.time,
    volunteers: input.volunteers,
    activityCoordinator: input.activityCoordinator,
    scheme: input.scheme,
    organizingUnit: input.organizingUnit,
    in_points: objectivesText,
    description: input.description,
    impact: input.impact,
    conclusion: input.conclusion,
    photos: input.photos?.map(p => ({ image: p.base64 })) || [],
  };

  input.photos?.forEach((p, i) => {
    renderData[`img${i}`] = p.base64;
  });

  doc.render(renderData);

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}
