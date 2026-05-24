// lib/reports/docx-client.ts
// Browser-only DOCX generation — zero Node.js imports.
// The template is fetched from /public/nss-report.docx via the Fetch API.

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
// @ts-ignore
import ImageModule from 'docxtemplater-image-module-free'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrowserPhotoData {
  file: File
  width: number
  height: number
}

export interface FillTemplateInputBrowser {
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
  photos?: BrowserPhotoData[]
}

// ─── Pure helpers (no Node.js deps) ─────────────────────────────────────────

function slugifyForFile(s: string): string {
  return s
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

/**
 * Mirrors the server-side buildReportFilename — pure string logic, safe in browser.
 */
export function buildReportFilename(
  activityTitle: string,
  eventDateStr: string | undefined,
  fallbackStart: Date,
): string {
  const title = slugifyForFile(activityTitle || 'NSS_Report')

  let dd = fallbackStart.getDate().toString().padStart(2, '0')
  let mm = (fallbackStart.getMonth() + 1).toString().padStart(2, '0')
  let yyyy = fallbackStart.getFullYear().toString()

  if (eventDateStr) {
    const cleaned = eventDateStr
      .replace(/^[A-Za-z]+,\s*/, '')
      .replace(/(\d+)(st|nd|rd|th)/i, '$1')
    const parsedDate = new Date(cleaned)
    if (!Number.isNaN(parsedDate.getTime())) {
      dd = parsedDate.getDate().toString().padStart(2, '0')
      mm = (parsedDate.getMonth() + 1).toString().padStart(2, '0')
      yyyy = parsedDate.getFullYear().toString()
    }
  }

  return `${dd}-${mm}-${yyyy}_${title}_Report.docx`
}

// ─── Image helpers ───────────────────────────────────────────────────────────

/** Convert a File object to a base64 string using only browser APIs. */
async function fileToBase64(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  const bytes = new Uint8Array(ab)
  // Use a chunked approach to avoid call-stack overflow on large images
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Decode a base64 string to Uint8Array (browser replacement for Buffer.from). */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate the NSS activity report DOCX entirely in the browser.
 * Fetches the template from /nss-report.docx (public/), embeds photos
 * locally, and returns a Blob — no server round-trip for the file itself.
 */
export async function fillNssReportTemplateBrowser(
  input: FillTemplateInputBrowser,
): Promise<Blob> {
  // 1. Fetch the DOCX template as an ArrayBuffer from the public folder
  const response = await fetch('/nss-report.docx')
  if (!response.ok) {
    throw new Error(`Failed to load report template (${response.status})`)
  }
  const templateBuffer = await response.arrayBuffer()
  const zip = new PizZip(templateBuffer)

  // 2. Convert every photo to base64 (browser-safe, stays in memory)
  const photoList: { base64: string; width: number; height: number }[] = []
  if (input.photos && input.photos.length > 0) {
    for (const p of input.photos) {
      const base64 = await fileToBase64(p.file)
      photoList.push({ base64, width: p.width, height: p.height })
    }
  }

  // 3. Inject per-image placeholder tags into the document XML
  //    (mirrors the server-side XML manipulation in docx.ts exactly)
  if (photoList.length > 0) {
    let docXml = zip.file('word/document.xml')?.asText()
    if (docXml) {
      const imgTags = photoList
        .map(
          (_, i) =>
            `</w:t></w:r><w:r><w:t xml:space="preserve">{%img${i}}</w:t></w:r><w:r><w:t xml:space="preserve"> `,
        )
        .join('')

      if (docXml.includes('{insert_photos}')) {
        docXml = docXml.replace('{insert_photos}', imgTags)
        zip.file('word/document.xml', docXml)
      } else if (docXml.includes('#photos') && docXml.includes('%image')) {
        docXml = docXml
          .replace(/\{#photos\}/g, '')
          .replace(/\{\/photos\}/g, '')
          .replace(/\{%image\}/g, imgTags)
        zip.file('word/document.xml', docXml)
      }
    }
  }

  // 4. Build a size lookup map keyed by base64 string
  const sizeMap = new Map<string, { width: number; height: number }>()
  photoList.forEach((p) => sizeMap.set(p.base64, { width: p.width, height: p.height }))

  // 5. Configure the image module (Uint8Array instead of Buffer — browser-safe)
  const imageModule = new ImageModule({
    centered: false,
    getImage(tagValue: string) {
      return base64ToUint8Array(tagValue)
    },
    getSize(_img: unknown, tagValue: string, _tagName: string): [number, number] {
      const size = sizeMap.get(tagValue)
      return size ? [size.width, size.height] : [250, 200]
    },
  })

  // 6. Render the template with docxtemplater
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
    modules: [imageModule],
  })

  const objectivesText = input.objectives.map((o) => `• ${o}`).join('\n')

  const renderData: Record<string, unknown> = {
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
    photos: photoList.map((p) => ({ image: p.base64 })),
  }

  // Add individual per-image keys ({%img0}, {%img1}, …)
  photoList.forEach((p, i) => {
    renderData[`img${i}`] = p.base64
  })

  doc.render(renderData)

  // 7. Generate a Blob — the browser equivalent of a Node.js Buffer
  return doc.getZip().generate({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}
