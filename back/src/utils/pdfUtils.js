// utils/pdfUtils.js
import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

export async function extractPagesText(filePath) {
  const raw = fs.readFileSync(filePath);
  const loadingTask = getDocument({ data: new Uint8Array(raw) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    pages.push({ pageNumber: i, text: pageText });
  }

  return pages;
}
