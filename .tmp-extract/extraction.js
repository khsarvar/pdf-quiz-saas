import { readFile } from 'fs/promises';
import { join } from 'path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
/**
 * Extracts raw text from uploaded documents (PDF or PPTX) stored on disk.
 */
export async function extractTextFromDocument(documentId, storageKey, mimeType) {
    const filePath = join(UPLOAD_DIR, storageKey);
    const fileBuffer = await readFile(filePath);
    if (mimeType === 'application/pdf') {
        const { text } = await parsePdf(fileBuffer);
        return text.trim();
    }
    if (mimeType ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        const zip = await JSZip.loadAsync(fileBuffer);
        const parser = new XMLParser({ ignoreAttributes: false });
        // Collect slide XML files (ppt/slides/slideX.xml)
        const slideFiles = Object.keys(zip.files).filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
        const slideTexts = [];
        for (const name of slideFiles) {
            const xml = await zip.files[name].async('string');
            const parsed = parser.parse(xml);
            // Recursively collect text nodes (<a:t>)
            const collectText = (node) => {
                if (!node || typeof node !== 'object')
                    return [];
                const obj = node;
                const hits = obj['a:t'];
                const currentTexts = Array.isArray(hits)
                    ? hits.map(String)
                    : hits !== undefined
                        ? [String(hits)]
                        : [];
                const childTexts = Object.values(obj).flatMap((child) => collectText(child));
                return [...currentTexts, ...childTexts];
            };
            slideTexts.push(...collectText(parsed));
        }
        return slideTexts.join('\n').trim();
    }
    throw new Error(`Unsupported mime type for extraction: ${mimeType} (document ${documentId})`);
}
async function parsePdf(buffer) {
    const mod = await import('pdf-parse');
    // pdf-parse ESM build exposes PDFParse; there is no default export
    const pdfParse = mod.PDFParse;
    return pdfParse(buffer);
}
