import { unzipSync } from "fflate";

const SPREADSHEET_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** ZIP(OOXML) 기반 한셀 `.cell` 바이트인지 확인 */
export function isHancomCellSpreadsheetBytes(bytes: ArrayBuffer): boolean {
	if (bytes.byteLength < 4) return false;
	const head = new Uint8Array(bytes, 0, 4);
	if (head[0] !== 0x50 || head[1] !== 0x4b) return false;
	try {
		const files = unzipSync(new Uint8Array(bytes));
		const workbook = files["xl/workbook.xml"];
		if (!workbook) return false;
		const xml = new TextDecoder().decode(workbook);
		return /appName="HCell"/.test(xml) || /<x:workbook[\s>]/.test(xml);
	} catch {
		return false;
	}
}

function decodeZipText(data: Uint8Array): string {
	return new TextDecoder().decode(data);
}

/** Hancom OOXML 태그(`x:`)를 기본 스프레드시트 태그로 바꿉니다. */
export function normalizeHancomSpreadsheetXml(xml: string): string {
	return xml
		.replace(
			/ xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g,
			` xmlns="${SPREADSHEET_MAIN_NS}"`
		)
		.replace(/<(\/?)x:([a-zA-Z0-9]+)/g, "<$1$2");
}

function collectTextNodes(block: string): string {
	const parts: string[] = [];
	const re = /<(?:x:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:x:)?t>/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(block))) {
		const text = match[1];
		if (!text) continue;
		parts.push(text.replace(/<[^>]+>/g, ""));
	}
	return parts.join("").trim();
}

/** sharedStrings.xml → 문자열 배열 */
export function parseHancomSharedStrings(xml: string): string[] {
	const normalized = normalizeHancomSpreadsheetXml(xml);
	const strings: string[] = [];
	const siRe = /<si>([\s\S]*?)<\/si>/g;
	let siMatch: RegExpExecArray | null;
	while ((siMatch = siRe.exec(normalized))) {
		const block = siMatch[1];
		if (!block) continue;
		strings.push(collectTextNodes(block));
	}
	return strings;
}

function columnLettersToIndex(col: string): number {
	let index = 0;
	for (let i = 0; i < col.length; i++) {
		index = index * 26 + (col.charCodeAt(i) - 64);
	}
	return index - 1;
}

function parseCellRef(ref: string): { row: number; col: number } {
	const match = /^([A-Z]+)(\d+)$/.exec(ref);
	if (!match) return { row: 0, col: 0 };
	const colLetters = match[1];
	const rowNum = match[2];
	if (!colLetters || !rowNum) return { row: 0, col: 0 };
	return {
		col: columnLettersToIndex(colLetters),
		row: Number.parseInt(rowNum, 10) - 1
	};
}

type SparseRow = Map<number, string>;

function parseWorksheetRows(xml: string, sharedStrings: string[]): SparseRow[] {
	const normalized = normalizeHancomSpreadsheetXml(xml);
	const rows: SparseRow[] = [];
	const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
	let rowMatch: RegExpExecArray | null;

	while ((rowMatch = rowRe.exec(normalized))) {
		const rowNum = rowMatch[1];
		const rowBlock = rowMatch[2];
		if (!rowNum || !rowBlock) continue;
		const rowIndex = Number.parseInt(rowNum, 10) - 1;
		const cells = new Map<number, string>();
		const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
		let cellMatch: RegExpExecArray | null;

		while ((cellMatch = cellRe.exec(rowBlock))) {
			const attrs = cellMatch[1];
			if (!attrs) continue;
			const inner = cellMatch[2] ?? "";
			const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs);
			if (!refMatch?.[1]) continue;
			const { col } = parseCellRef(refMatch[1]);
			const typeMatch = /\bt="([^"]+)"/.exec(attrs);
			const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
			if (!valueMatch?.[1]) continue;
			const raw = valueMatch[1].trim();
			let text = raw;
			if (typeMatch?.[1] === "s") {
				const idx = Number.parseInt(raw, 10);
				text = sharedStrings[idx] ?? "";
			}
			cells.set(col, text);
		}

		if (cells.size) {
			while (rows.length <= rowIndex) rows.push(new Map());
			rows[rowIndex] = cells;
		}
	}

	return rows;
}

function sparseRowsToMatrix(rows: SparseRow[]): string[][] {
	let maxCol = 0;
	let maxRow = -1;
	for (let i = 0; i < rows.length; i++) {
		const sparse = rows[i];
		if (!sparse?.size) continue;
		maxRow = Math.max(maxRow, i);
		for (const col of sparse.keys()) {
			maxCol = Math.max(maxCol, col);
		}
	}
	if (maxRow < 0) return [];

	const matrix: string[][] = [];
	for (let r = 0; r <= maxRow; r++) {
		const sparse = rows[r];
		const line = Array.from({ length: maxCol + 1 }, () => "");
		if (sparse?.size) {
			for (const [col, value] of sparse.entries()) {
				line[col] = value;
			}
		}
		matrix.push(line);
	}
	return matrix;
}

/** 한셀 `.cell` ZIP → 시트명 + 행 데이터 */
export function readHancomCellWorkbook(bytes: ArrayBuffer): { sheetNames: string[]; sheets: string[][][] } {
	const files = unzipSync(new Uint8Array(bytes));
	const sharedStrings = files["xl/sharedStrings.xml"]
		? parseHancomSharedStrings(decodeZipText(files["xl/sharedStrings.xml"]))
		: [];

	const workbookXml = decodeZipText(files["xl/workbook.xml"] ?? new Uint8Array());
	const relsXml = decodeZipText(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());

	const relTargets = new Map<string, string>();
	for (const match of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
		const id = match[1];
		const target = match[2];
		if (!id || !target) continue;
		relTargets.set(id, target.replace(/^\/?/, "xl/"));
	}

	const sheetEntries: Array<{ name: string; path: string }> = [];
	for (const match of workbookXml.matchAll(/<(?:x:)?sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)) {
		const name = match[1];
		const relId = match[2];
		if (!name || !relId) continue;
		const target = relTargets.get(relId);
		if (target) sheetEntries.push({ name, path: target });
	}

	const sheetNames: string[] = [];
	const sheets: string[][][] = [];
	for (const entry of sheetEntries) {
		const sheetXml = files[entry.path];
		if (!sheetXml) continue;
		const rows = parseWorksheetRows(decodeZipText(sheetXml), sharedStrings);
		const matrix = sparseRowsToMatrix(rows);
		if (!matrix.length) continue;
		sheetNames.push(entry.name);
		sheets.push(matrix);
	}

	return { sheetNames, sheets };
}
