/**
 * 스프레드시트 → 인라인 HTML (병합·서식).
 * xlsx/ods: SheetJS sheet_to_html(병합) + OOXML styles.xml(테두리·색·정렬)
 */

import { unzipSync } from "fflate";
import {
  applyOoxmlStylesToSheetHtml,
  parseOoxmlStyleSheetXml,
  parseSheetCellXfMap,
  type OoxmlStyleIndex,
} from "./ooxmlSpreadsheetStyles";

function isZipBytes(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const h = new Uint8Array(bytes, 0, 4);
  return h[0] === 0x50 && h[1] === 0x4b;
}

function decodeZipText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

type ZipFiles = Record<string, Uint8Array>;

function loadOoxmlStylePack(files: ZipFiles): OoxmlStyleIndex | null {
  const stylesXml = files["xl/styles.xml"];
  if (!stylesXml) return null;
  return parseOoxmlStyleSheetXml(decodeZipText(stylesXml));
}

function resolveWorkbookSheets(files: ZipFiles): Array<{ name: string; path: string }> {
  const workbookXml = decodeZipText(files["xl/workbook.xml"] ?? new Uint8Array());
  const relsXml = decodeZipText(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const relTargets = new Map<string, string>();
  for (const match of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    const id = match[1];
    const target = match[2];
    if (!id || !target) continue;
    relTargets.set(id, target.replace(/^\/?/, "xl/"));
  }
  const entries: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(
    /<(?:x:)?sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g,
  )) {
    const name = match[1];
    const relId = match[2];
    if (!name || !relId) continue;
    const target = relTargets.get(relId);
    if (target) entries.push({ name, path: target });
  }
  return entries;
}

function extractTableFromSheetToHtml(fullHtml: string): string {
  const match = /<table[\s\S]*<\/table>/i.exec(fullHtml);
  return match?.[0] ?? fullHtml;
}

type SpreadsheetPreviewSheet = {
  sheetName: string;
  tableHtml: string;
};

async function buildXlsxRichPreviewParts(
  bytes: ArrayBuffer,
): Promise<SpreadsheetPreviewSheet[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: false });
  const zipFiles = isZipBytes(bytes) ? unzipSync(new Uint8Array(bytes)) : null;
  const styleIndex = zipFiles ? loadOoxmlStylePack(zipFiles) : null;
  const zipSheets = zipFiles ? resolveWorkbookSheets(zipFiles) : [];

  const sheets: SpreadsheetPreviewSheet[] = [];
  for (let i = 0; i < wb.SheetNames.length; i++) {
    const sheetName = wb.SheetNames[i]!;
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    let tableHtml = extractTableFromSheetToHtml(
      XLSX.utils.sheet_to_html(ws),
    ).replace(/<table\b/i, '<table class="spreadsheet-preview-table"');

    if (zipFiles && styleIndex) {
      const entry = zipSheets.find((s) => s.name === sheetName);
      const sheetXml = entry?.path ? zipFiles[entry.path] : undefined;
      if (sheetXml) {
        const xml = decodeZipText(sheetXml);
        const cellXfMap = parseSheetCellXfMap(xml);
        tableHtml = applyOoxmlStylesToSheetHtml(tableHtml, cellXfMap, styleIndex);
      }
    }

    sheets.push({ sheetName, tableHtml });
  }
  return sheets;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapSheetBlock(sheetName: string, tableHtml: string, sheetIndex: number): string {
  const title = sheetName
    ? `<div class="spreadsheet-sheet-title">${escapeHtml(sheetName)}</div>`
    : "";
  const hidden = sheetIndex > 0 ? ' style="display:none"' : "";
  return `${title}<div class="spreadsheet-sheet-wrap"${hidden}>${tableHtml}</div>`;
}

function richPreviewPartsToHtml(parts: SpreadsheetPreviewSheet[]): string {
  if (!parts.length) return "";
  const blocks = parts.map((p, i) => wrapSheetBlock(p.sheetName, p.tableHtml, i));
  return blocks.join("\n");
}

/** xlsx/xls → 시트별 rich HTML 미리보기 */
export async function buildSpreadsheetPreviewHtml(
  bytes: ArrayBuffer,
): Promise<{ html: string; sheetCount: number } | { error: string }> {
  try {
    const parts = await buildXlsxRichPreviewParts(bytes);
    if (!parts.length) return { error: "표시할 내용이 없습니다." };
    return {
      html: richPreviewPartsToHtml(parts),
      sheetCount: parts.length,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "스프레드시트를 읽을 수 없습니다.",
    };
  }
}
