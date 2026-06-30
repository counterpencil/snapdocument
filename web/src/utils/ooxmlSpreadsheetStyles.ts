/**
 * OOXML(xlsx·한셀 .cell) styles.xml / 시트 셀 s="N" → 인라인 CSS.
 * LibreOffice ScHTMLExport와 유사하게 테두리·채움·글꼴·정렬을 td에 적용합니다.
 * SheetJS CE는 스타일을 거의 읽지 않으므로 ZIP XML을 직접 파싱합니다.
 */

import { normalizeHancomSpreadsheetXml } from "./hancomCellSpreadsheet";

export type OoxmlRgb = string;

export type OoxmlBorderSide = {
	style?: string;
	color?: OoxmlRgb;
};

export type OoxmlBorder = {
	top?: OoxmlBorderSide;
	right?: OoxmlBorderSide;
	bottom?: OoxmlBorderSide;
	left?: OoxmlBorderSide;
};

export type OoxmlFont = {
	bold?: boolean;
	italic?: boolean;
	sizePt?: number;
	color?: OoxmlRgb;
	name?: string;
};

export type OoxmlFill = {
	patternType?: string;
	fgColor?: OoxmlRgb;
	bgColor?: OoxmlRgb;
};

export type OoxmlAlignment = {
	horizontal?: string;
	vertical?: string;
	wrapText?: boolean;
};

export type OoxmlCellXf = {
	fontId?: number;
	fillId?: number;
	borderId?: number;
	alignment?: OoxmlAlignment;
};

export type OoxmlStyleIndex = {
	fonts: OoxmlFont[];
	fills: OoxmlFill[];
	borders: OoxmlBorder[];
	xfs: OoxmlCellXf[];
};

const BORDER_CSS: Record<string, string> = {
	thin: "1px solid",
	medium: "2px solid",
	thick: "3px solid",
	hair: "1px solid",
	dashed: "1px dashed",
	dotted: "1px dotted",
	double: "3px double",
};

function parseRgbAttr(attrs: string): OoxmlRgb | undefined {
	const m = /\brgb="([^"]+)"/.exec(attrs);
	if (!m?.[1]) return undefined;
	const hex = m[1].replace(/^FF/i, "").slice(-6);
	return `#${hex}`;
}

function parseAttrInt(attrs: string, name: string): number | undefined {
	const m = new RegExp(`\\b${name}="(\\d+)"`).exec(attrs);
	if (!m?.[1]) return undefined;
	return Number.parseInt(m[1], 10);
}

function parseAttrStr(attrs: string, name: string): string | undefined {
	const m = new RegExp(`\\b${name}="([^"]+)"`).exec(attrs);
	return m?.[1];
}

function collectChildBlocks(outer: string, tag: string): string[] {
	const blocks: string[] = [];
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
	let match: RegExpExecArray | null;
	while ((match = re.exec(outer))) {
		const block = match[1];
		if (block !== undefined) blocks.push(block);
	}
	return blocks;
}

function parseBorderSide(block: string): OoxmlBorderSide {
	const attrs = block.match(/^[^>]*/)?.[0] ?? "";
	const style = parseAttrStr(attrs, "style");
	const colorBlock = block.match(/<color\b([^>]*)\/?>/)?.[1];
	const color = colorBlock ? parseRgbAttr(colorBlock) : undefined;
	return { style, color };
}

function parseBorderBlock(block: string): OoxmlBorder {
	const border: OoxmlBorder = {};
	for (const side of ["top", "right", "bottom", "left"] as const) {
		const m = new RegExp(`<${side}\\b([^>]*)>([\\s\\S]*?)<\\/${side}>`).exec(
			block,
		);
		if (m) border[side] = parseBorderSide(`${m[1] ?? ""}${m[2] ?? ""}`);
	}
	return border;
}

function parseFontBlock(block: string): OoxmlFont {
	const font: OoxmlFont = {};
	if (/<b\b/.test(block)) font.bold = true;
	if (/<i\b/.test(block)) font.italic = true;
	const sz = block.match(/<sz\b[^>]*\bval="(\d+)"/);
	if (sz?.[1]) font.sizePt = Number.parseInt(sz[1], 10);
	const name = block.match(/<name\b[^>]*\bval="([^"]+)"/);
	if (name?.[1]) font.name = name[1];
	const color = block.match(/<color\b([^>]*)\/?>/);
	if (color?.[1]) font.color = parseRgbAttr(color[1]);
	return font;
}

function parseFillBlock(block: string): OoxmlFill {
	const fill: OoxmlFill = {};
	const pattern = block.match(/<patternFill\b[^>]*\bpatternType="([^"]+)"/);
	if (pattern?.[1]) fill.patternType = pattern[1];
	const fg = block.match(/<fgColor\b([^>]*)\/?>/);
	if (fg?.[1]) fill.fgColor = parseRgbAttr(fg[1]);
	const bg = block.match(/<bgColor\b([^>]*)\/?>/);
	if (bg?.[1]) fill.bgColor = parseRgbAttr(bg[1]);
	return fill;
}

function parseXfBlock(block: string): OoxmlCellXf {
	const head = block.match(/^<xf\b([^>]*)>/)?.[1] ?? "";
	const xf: OoxmlCellXf = {
		fontId: parseAttrInt(head, "fontId"),
		fillId: parseAttrInt(head, "fillId"),
		borderId: parseAttrInt(head, "borderId"),
	};
	const align = block.match(/<alignment\b([^>]*)\/?>/);
	if (align?.[1]) {
		xf.alignment = {
			horizontal: parseAttrStr(align[1], "horizontal"),
			vertical: parseAttrStr(align[1], "vertical"),
			wrapText: /\bwrapText="1"/.test(align[1]),
		};
	}
	return xf;
}

/** styles.xml → 스타일 인덱스 */
export function parseOoxmlStyleSheetXml(xml: string): OoxmlStyleIndex {
	const normalized = normalizeHancomSpreadsheetXml(xml);
	const fontsRoot = normalized.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? "";
	const fillsRoot = normalized.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? "";
	const bordersRoot =
		normalized.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)?.[1] ?? "";
	const xfsRoot =
		normalized.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";

	return {
		fonts: collectChildBlocks(fontsRoot, "font").map(parseFontBlock),
		fills: collectChildBlocks(fillsRoot, "fill").map(parseFillBlock),
		borders: collectChildBlocks(bordersRoot, "border").map(parseBorderBlock),
		xfs: collectChildBlocks(xfsRoot, "xf").map(parseXfBlock),
	};
}

function borderSideToCss(side: OoxmlBorderSide | undefined): string | undefined {
	if (!side?.style || side.style === "none") return undefined;
	const line = BORDER_CSS[side.style] ?? "1px solid";
	const color = side.color ?? "#333";
	return `${line} ${color}`;
}

/** cellXf + 부속 테이블 → CSS 선언 문자열 */
export function cellXfToCss(
	xfIndex: number,
	index: OoxmlStyleIndex,
): string {
	const xf = index.xfs[xfIndex];
	if (!xf) return "";

	const parts: string[] = [];

	const font = xf.fontId !== undefined ? index.fonts[xf.fontId] : undefined;
	if (font?.bold) parts.push("font-weight:700");
	if (font?.italic) parts.push("font-style:italic");
	if (font?.sizePt) parts.push(`font-size:${font.sizePt}pt`);
	if (font?.name) parts.push(`font-family:${font.name},sans-serif`);
	if (font?.color) parts.push(`color:${font.color}`);

	const fill = xf.fillId !== undefined ? index.fills[xf.fillId] : undefined;
	if (fill?.fgColor && fill.patternType && fill.patternType !== "none") {
		parts.push(`background-color:${fill.fgColor}`);
	} else if (fill?.bgColor && fill.patternType && fill.patternType !== "none") {
		parts.push(`background-color:${fill.bgColor}`);
	}

	const border =
		xf.borderId !== undefined ? index.borders[xf.borderId] : undefined;
	if (border) {
		const top = borderSideToCss(border.top);
		const right = borderSideToCss(border.right);
		const bottom = borderSideToCss(border.bottom);
		const left = borderSideToCss(border.left);
		if (top) parts.push(`border-top:${top}`);
		if (right) parts.push(`border-right:${right}`);
		if (bottom) parts.push(`border-bottom:${bottom}`);
		if (left) parts.push(`border-left:${left}`);
	}

	const align = xf.alignment;
	if (align?.horizontal) {
		const h = align.horizontal;
		if (h === "center" || h === "centerContinuous")
			parts.push("text-align:center");
		else if (h === "right") parts.push("text-align:right");
		else if (h === "left") parts.push("text-align:left");
	}
	if (align?.vertical) {
		const v = align.vertical;
		if (v === "center") parts.push("vertical-align:middle");
		else if (v === "top") parts.push("vertical-align:top");
		else if (v === "bottom") parts.push("vertical-align:bottom");
	}
	if (align?.wrapText) parts.push("white-space:pre-wrap");

	return parts.join(";");
}

/** 시트 XML: A1 → xf 인덱스 (s 속성) */
export function parseSheetCellXfMap(sheetXml: string): Map<string, number> {
	const normalized = normalizeHancomSpreadsheetXml(sheetXml);
	const map = new Map<string, number>();
	const cellRe = /<(?:x:)?c\b([^>]*?)(?:\/>|>)/g;
	let match: RegExpExecArray | null;
	while ((match = cellRe.exec(normalized))) {
		const attrs = match[1];
		if (!attrs) continue;
		const ref = parseAttrStr(attrs, "r");
		const styleIdx = parseAttrInt(attrs, "s");
		if (ref && styleIdx !== undefined) map.set(ref, styleIdx);
	}
	return map;
}

export type OoxmlMergeRange = {
	startRow: number;
	startCol: number;
	endRow: number;
	endCol: number;
};

/** 시트 XML mergeCell ref="A1:B2" */
export function parseSheetMergeRanges(sheetXml: string): OoxmlMergeRange[] {
	const normalized = normalizeHancomSpreadsheetXml(sheetXml);
	const ranges: OoxmlMergeRange[] = [];
	for (const match of normalized.matchAll(
		/<(?:x:)?mergeCell\b[^>]*\bref="([^"]+)"/g,
	)) {
		const ref = match[1];
		if (!ref) continue;
		const parsed = parseA1Range(ref);
		if (parsed) ranges.push(parsed);
	}
	return ranges;
}

function columnLettersToIndex(col: string): number {
	let index = 0;
	for (let i = 0; i < col.length; i++) {
		index = index * 26 + (col.charCodeAt(i) - 64);
	}
	return index - 1;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
	const match = /^([A-Z]+)(\d+)$/.exec(ref);
	if (!match?.[1] || !match[2]) return null;
	return {
		col: columnLettersToIndex(match[1]),
		row: Number.parseInt(match[2], 10) - 1,
	};
}

function parseA1Range(ref: string): OoxmlMergeRange | null {
	const parts = ref.split(":");
	if (parts.length !== 2) return null;
	const start = parseCellRef(parts[0]!);
	const end = parseCellRef(parts[1]!);
	if (!start || !end) return null;
	return {
		startRow: start.row,
		startCol: start.col,
		endRow: end.row,
		endCol: end.col,
	};
}

/** SheetJS sheet_to_html의 id="sjs-A1" 셀에 OOXML 스타일 병합 */
export function applyOoxmlStylesToSheetHtml(
	tableHtml: string,
	cellXfMap: Map<string, number>,
	styleIndex: OoxmlStyleIndex,
): string {
	if (!cellXfMap.size) return tableHtml;

	return tableHtml.replace(
		/<(td|th)\b([^>]*)\bid="sjs-([A-Z]+\d+)"([^>]*)>/gi,
		(full, tag: string, before: string, ref: string, after: string) => {
			const xfIdx = cellXfMap.get(ref);
			if (xfIdx === undefined) return full;
			const css = cellXfToCss(xfIdx, styleIndex);
			if (!css) return full;
			const attrs = `${before}${after}`;
			if (/\bstyle="/i.test(attrs)) {
				return `<${tag}${attrs.replace(
					/\bstyle="([^"]*)"/i,
					(_m, prev: string) => ` style="${prev};${css}"`,
				)} id="sjs-${ref}">`;
			}
			return `<${tag}${before}id="sjs-${ref}" style="${css}"${after}>`;
		},
	);
}
