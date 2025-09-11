import fs from "fs";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

export async function extractPagesText(filePath) {
  const raw = fs.readFileSync(filePath);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(raw) }); // << ici
  const pdf = await loadingTask.promise;

  const pages = [];
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    pages.push({ pageNumber: i, text: pageText });
  }

  pdf.destroy(); // nettoyage
  return pages;
}
