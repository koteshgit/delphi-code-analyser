import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType,
  AlignmentType, ExternalHyperlink,
  Bookmark, InternalHyperlink, TabStopPosition, TabStopType,
  Header, Footer, PageNumber, ImageRun, BorderStyle
} from "docx";
import PDFDocument from "pdfkit";
import pako from "pako";
import type { AnalysisResult } from "../shared/schema";

interface ProjectInfo {
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  totalFiles: number | null;
  tripleCount: number | null;
  createdAt: Date | null;
}

const SECTION_ORDER = [
  "architecture",
  "class_hierarchy",
  "dependencies",
  "complexity",
  "patterns",
  "api_soa_contracts",
  "control_flow",
  "data_flow",
  "sequence_diagrams",
  "mvc_layers",
  "class_interactions",
  "class_diagrams",
  "bpmn",
  "entity_flow",
];

const SECTION_TITLES: Record<string, string> = {
  architecture: "Architecture Analysis",
  class_hierarchy: "Class Hierarchy",
  dependencies: "Dependency Analysis",
  complexity: "Complexity Metrics",
  patterns: "Design Pattern Detection",
  api_soa_contracts: "API / SOA Web Service Contracts",
  control_flow: "Control Flow Analysis",
  data_flow: "Data Flow Analysis",
  sequence_diagrams: "Sequence Diagrams",
  mvc_layers: "MVC Layer Diagram",
  class_interactions: "Class & Object Interaction Diagrams",
  class_diagrams: "Class & Object Diagrams",
  bpmn: "BPMN Workflow Diagrams",
  entity_flow: "Business Data Entity Flow",
};

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return "-";
  if (b === 1) return "_";
  return "?";
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3F;
  return encode6bit(c1 & 0x3F) + encode6bit(c2 & 0x3F) + encode6bit(c3 & 0x3F) + encode6bit(c4 & 0x3F);
}

function plantumlEncode(text: string): string {
  const data = pako.deflateRaw(new TextEncoder().encode(text), { level: 9 });
  let encoded = "";
  for (let i = 0; i < data.length; i += 3) {
    const b1 = data[i];
    const b2 = i + 1 < data.length ? data[i + 1] : 0;
    const b3 = i + 2 < data.length ? data[i + 2] : 0;
    encoded += append3bytes(b1, b2, b3);
  }
  return encoded;
}

async function fetchPlantUmlPng(code: string): Promise<Buffer | null> {
  try {
    const encoded = plantumlEncode(code);
    const url = `https://www.plantuml.com/plantuml/png/${encoded}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function fetchMermaidPng(code: string): Promise<Buffer | null> {
  try {
    const encoded = Buffer.from(code).toString("base64url");
    const url = `https://mermaid.ink/img/${encoded}?type=png&bgColor=white`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

interface DiagramBlock {
  type: "plantuml" | "mermaid";
  code: string;
  imageBuffer: Buffer | null;
}

interface ContentBlock {
  type: "heading" | "paragraph" | "table" | "list" | "diagram";
  level?: number;
  text?: string;
  rows?: string[][];
  items?: string[];
  diagram?: DiagramBlock;
}

function parseContentBlocks(content: string): { blocks: ContentBlock[]; diagramCodes: { type: "plantuml" | "mermaid"; code: string; blockIndex: number }[] } {
  const blocks: ContentBlock[] = [];
  const diagramCodes: { type: "plantuml" | "mermaid"; code: string; blockIndex: number }[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```plantuml") || line.startsWith("```mermaid")) {
      const lang = line.startsWith("```plantuml") ? "plantuml" : "mermaid";
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && lines[i] !== "```") {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const code = codeLines.join("\n");
      const blockIndex = blocks.length;
      blocks.push({ type: "diagram", diagram: { type: lang, code, imageBuffer: null } });
      diagramCodes.push({ type: lang, code, blockIndex });
      continue;
    }

    if (line.startsWith("```")) {
      i++;
      while (i < lines.length && lines[i] !== "```") i++;
      if (i < lines.length) i++;
      continue;
    }

    if (line.match(/^#{1,6}\s/)) {
      const match = line.match(/^(#{1,6})\s+(.*)/);
      if (match) {
        blocks.push({ type: "heading", level: match[1].length, text: match[2].replace(/\*\*/g, "") });
      }
      i++;
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s-:|]+\|/)) {
      const tableRows: string[][] = [];
      const headerCells = line.split("|").filter(c => c.trim() !== "").map(c => c.trim());
      tableRows.push(headerCells);
      i += 2;
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").filter(c => c.trim() !== "").map(c => c.trim());
        if (cells.length > 0) tableRows.push(cells);
        i++;
      }
      blocks.push({ type: "table", rows: tableRows });
      continue;
    }

    if (line.match(/^\s*[-*]\s+/) || line.match(/^\s*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^\s*[-*]\s+/) || lines[i].match(/^\s*\d+\.\s+/))) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+\.\s+/, "").trim();
        items.push(itemText);
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (line.trim()) {
      blocks.push({ type: "paragraph", text: line });
    }
    i++;
  }

  return { blocks, diagramCodes };
}

async function fetchAllDiagrams(allDiagrams: { type: "plantuml" | "mermaid"; code: string; sectionIdx: number; blockIndex: number }[]): Promise<Map<string, Buffer | null>> {
  const results = new Map<string, Buffer | null>();
  const BATCH_SIZE = 3;

  for (let i = 0; i < allDiagrams.length; i += BATCH_SIZE) {
    const batch = allDiagrams.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (d) => {
      const key = `${d.sectionIdx}_${d.blockIndex}`;
      let img: Buffer | null = null;
      if (d.type === "plantuml") {
        img = await fetchPlantUmlPng(d.code);
      } else {
        img = await fetchMermaidPng(d.code);
      }
      results.set(key, img);
    });
    await Promise.all(promises);
  }

  return results;
}

function sortResults(results: AnalysisResult[]): AnalysisResult[] {
  const display = results.filter(r => !r.resultType.startsWith("export_") && r.resultType !== "summary");
  return display.sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.resultType);
    const bi = SECTION_ORDER.indexOf(b.resultType);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 22, font: "Calibri" }));
    }
    if (match[1]) {
      runs.push(new TextRun({ text: match[1], bold: true, size: 22, font: "Calibri" }));
    } else if (match[2]) {
      runs.push(new TextRun({ text: match[2], size: 20, font: "Consolas", shading: { fill: "f0f0f0" } }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, size: 22, font: "Calibri" }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), size: 22, font: "Calibri" }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text: text, size: 22, font: "Calibri" }));
  }

  return runs;
}

function cleanInlineText(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    return { width: 400, height: 300 };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0 || width > 10000 || height > 10000) {
    return { width: 400, height: 300 };
  }
  return { width, height };
}

function fitImageToPage(imgWidth: number, imgHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  let w = imgWidth;
  let h = imgHeight;
  if (w > maxWidth) {
    const scale = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * scale);
  }
  if (h > maxHeight) {
    const scale = maxHeight / h;
    h = maxHeight;
    w = Math.round(w * scale);
  }
  return { width: w, height: h };
}

export async function generateDocxReport(project: ProjectInfo, results: AnalysisResult[]): Promise<Buffer> {
  const sorted = sortResults(results);

  const allDiagrams: { type: "plantuml" | "mermaid"; code: string; sectionIdx: number; blockIndex: number }[] = [];
  const sectionParsed: { blocks: ContentBlock[] }[] = [];

  for (let sIdx = 0; sIdx < sorted.length; sIdx++) {
    const { blocks, diagramCodes } = parseContentBlocks(sorted[sIdx].content || "");
    sectionParsed.push({ blocks });
    for (const dc of diagramCodes) {
      allDiagrams.push({ type: dc.type, code: dc.code, sectionIdx: sIdx, blockIndex: dc.blockIndex });
    }
  }

  const diagramImages = await fetchAllDiagrams(allDiagrams);

  for (const d of allDiagrams) {
    const key = `${d.sectionIdx}_${d.blockIndex}`;
    const img = diagramImages.get(key);
    if (img && sectionParsed[d.sectionIdx].blocks[d.blockIndex]?.diagram) {
      sectionParsed[d.sectionIdx].blocks[d.blockIndex].diagram!.imageBuffer = img;
    }
  }

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    new Paragraph({
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Delphi Legacy Code Analysis Report", bold: true, size: 56, font: "Calibri", color: "1a56db" })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: project.name, bold: true, size: 40, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, size: 22, font: "Calibri", color: "666666" })],
    }),
  );

  if (project.sourceUrl) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Repository: ", size: 22, font: "Calibri", color: "666666" }),
        new ExternalHyperlink({
          children: [new TextRun({ text: project.sourceUrl, style: "Hyperlink", size: 22, font: "Calibri" })],
          link: project.sourceUrl,
        }),
      ],
    }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({ text: `Files: ${project.totalFiles || 0}  •  RDF Triples: ${project.tripleCount || 0}  •  Source: ${project.sourceType}`, size: 20, font: "Calibri", color: "888888" }),
      ],
    }),
  );

  children.push(
    new Paragraph({ pageBreakBefore: true, spacing: { after: 300 }, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: "Calibri", color: "1a56db" })] }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 80 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: "dot" }],
      children: [
        new InternalHyperlink({
          anchor: "section_introduction",
          children: [new TextRun({ text: "1. Introduction", size: 22, font: "Calibri", color: "1a56db", underline: {} })],
        }),
      ],
    }),
  );

  sorted.forEach((result, idx) => {
    const sectionNum = idx + 2;
    const title = SECTION_TITLES[result.resultType] || result.title;
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: "dot" }],
        children: [
          new InternalHyperlink({
            anchor: `section_${result.resultType}`,
            children: [new TextRun({ text: `${sectionNum}. ${title}`, size: 22, font: "Calibri", color: "1a56db", underline: {} })],
          }),
        ],
      }),
    );
  });

  children.push(
    new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [
      new Bookmark({ id: "section_introduction", children: [new TextRun({ text: "1. Introduction", bold: true, size: 32, font: "Calibri", color: "1a56db" })] }),
    ] }),
    new Paragraph({ spacing: { after: 150 }, children: [new TextRun({
      text: `This report presents the automated legacy code analysis results for the Delphi/Object Pascal project "${project.name}". The analysis was performed using a multi-agent pipeline that parses source code, constructs semantic knowledge graphs, and applies reasoning to extract architectural insights, design patterns, complexity metrics, and structural relationships.`,
      size: 22, font: "Calibri",
    })] }),
  );

  if (project.sourceUrl) {
    children.push(new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: "The source code was obtained from: ", size: 22, font: "Calibri" }),
        new ExternalHyperlink({
          children: [new TextRun({ text: project.sourceUrl, style: "Hyperlink", size: 22, font: "Calibri" })],
          link: project.sourceUrl,
        }),
      ],
    }));
  } else {
    children.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: "The source code was provided via file upload.", size: 22, font: "Calibri" })] }));
  }

  children.push(new Paragraph({ spacing: { after: 300 }, children: [new TextRun({
    text: `The codebase contains ${project.totalFiles || 0} parsed source files, from which ${project.tripleCount || 0} RDF triples were extracted to form a comprehensive knowledge graph. The following sections detail the findings across architecture, dependencies, complexity, design patterns, and visual diagrams.`,
    size: 22, font: "Calibri",
  })] }));

  sorted.forEach((result, sIdx) => {
    const sectionNum = sIdx + 2;
    const title = SECTION_TITLES[result.resultType] || result.title;
    const bookmarkId = `section_${result.resultType}`;

    children.push(
      new Paragraph({
        pageBreakBefore: true,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
        children: [
          new Bookmark({ id: bookmarkId, children: [new TextRun({ text: `${sectionNum}. ${title}`, bold: true, size: 32, font: "Calibri", color: "1a56db" })] }),
        ],
      }),
    );

    const { blocks } = sectionParsed[sIdx];

    for (const block of blocks) {
      if (block.type === "heading") {
        const headingLevel = block.level === 2 ? HeadingLevel.HEADING_2 :
                             block.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
        children.push(new Paragraph({
          heading: headingLevel,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: block.text || "", bold: true, size: block.level === 2 ? 28 : block.level === 3 ? 24 : 22, font: "Calibri" })],
        }));
      } else if (block.type === "paragraph") {
        const runs = parseInlineFormatting(block.text || "");
        children.push(new Paragraph({ spacing: { after: 100 }, children: runs }));
      } else if (block.type === "diagram" && block.diagram) {
        if (block.diagram.imageBuffer) {
          const dim = getPngDimensions(block.diagram.imageBuffer);
          const fitted = fitImageToPage(dim.width, dim.height, 580, 700);
          children.push(new Paragraph({
            spacing: { before: 100, after: 60 },
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: block.diagram.imageBuffer,
                transformation: { width: fitted.width, height: fitted.height },
                type: "png",
              }),
            ],
          }));
          children.push(new Paragraph({
            spacing: { after: 100 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `${block.diagram.type === "plantuml" ? "PlantUML" : "Mermaid"} diagram`, italics: true, size: 18, font: "Calibri", color: "888888" })],
          }));
        } else {
          children.push(new Paragraph({
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: `[${block.diagram.type === "plantuml" ? "PlantUML" : "Mermaid"} diagram — could not be rendered for this report]`, italics: true, size: 20, font: "Calibri", color: "888888" })],
          }));
        }
      } else if (block.type === "list") {
        for (const item of block.items || []) {
          const runs = parseInlineFormatting(item);
          children.push(new Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: runs }));
        }
      } else if (block.type === "table" && block.rows && block.rows.length > 0) {
        const colCount = block.rows[0].length;
        const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
        const tableRows = block.rows.map((row, rowIdx) =>
          new TableRow({
            children: Array.from({ length: colCount }, (_, c) =>
              new TableCell({
                width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
                shading: rowIdx === 0 ? { fill: "e8edf5" } : rowIdx % 2 === 0 ? { fill: "f8f9fa" } : undefined,
                borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
                children: [new Paragraph({
                  spacing: { after: 40, before: 40 },
                  children: [new TextRun({
                    text: row[c] || "",
                    bold: rowIdx === 0,
                    size: 18,
                    font: "Calibri",
                  })],
                })],
              })
            ),
          })
        );

        children.push(new Paragraph({ spacing: { before: 100 }, children: [] }));
        children.push(new Table({ rows: tableRows, width: { size: 9000, type: WidthType.DXA } }) as any);
        children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      }
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { size: 22, font: "Calibri" } },
        hyperlink: { run: { color: "1a56db", underline: {} } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${project.name} – Analysis Report`, size: 16, font: "Calibri", color: "999999", italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", size: 16, font: "Calibri", color: "999999" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri", color: "999999" }),
              new TextRun({ text: " of ", size: 16, font: "Calibri", color: "999999" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Calibri", color: "999999" }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}


export async function generatePdfReport(project: ProjectInfo, results: AnalysisResult[]): Promise<Buffer> {
  const sorted = sortResults(results);

  const allDiagrams: { type: "plantuml" | "mermaid"; code: string; sectionIdx: number; blockIndex: number }[] = [];
  const sectionParsed: { blocks: ContentBlock[] }[] = [];

  for (let sIdx = 0; sIdx < sorted.length; sIdx++) {
    const { blocks, diagramCodes } = parseContentBlocks(sorted[sIdx].content || "");
    sectionParsed.push({ blocks });
    for (const dc of diagramCodes) {
      allDiagrams.push({ type: dc.type, code: dc.code, sectionIdx: sIdx, blockIndex: dc.blockIndex });
    }
  }

  const diagramImages = await fetchAllDiagrams(allDiagrams);

  for (const d of allDiagrams) {
    const key = `${d.sectionIdx}_${d.blockIndex}`;
    const img = diagramImages.get(key);
    if (img && sectionParsed[d.sectionIdx].blocks[d.blockIndex]?.diagram) {
      sectionParsed[d.sectionIdx].blocks[d.blockIndex].diagram!.imageBuffer = img;
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `${project.name} – Analysis Report`,
        Author: "Delphi Legacy Code Analyser",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 72;
    const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
    const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - 30;
    const blue = "#1a56db";
    const gray = "#666666";
    const lightGray = "#999999";

    function ensureSpace(needed: number) {
      if (doc.y + needed > BOTTOM_LIMIT) {
        doc.addPage();
      }
    }

    doc.moveDown(4);
    doc.font("Helvetica-Bold").fontSize(26).fillColor(blue)
      .text("Delphi Legacy Code", { align: "center" });
    doc.moveDown(0.2);
    doc.text("Analysis Report", { align: "center" });
    doc.moveDown(1.5);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000000")
      .text(project.name, { align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(11).fillColor(gray)
      .text(`Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
    doc.moveDown(0.5);

    if (project.sourceUrl) {
      doc.font("Helvetica").fontSize(10).fillColor(gray)
        .text("Repository:", { align: "center" });
      doc.font("Helvetica").fontSize(9).fillColor(blue)
        .text(project.sourceUrl, { align: "center", link: project.sourceUrl, underline: true });
    }

    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9).fillColor(lightGray)
      .text(`Files: ${project.totalFiles || 0}  •  RDF Triples: ${project.tripleCount || 0}  •  Source: ${project.sourceType}`, { align: "center" });

    doc.addPage();
    const tocPageStart = doc.bufferedPageRange().count - 1;

    doc.font("Helvetica-Bold").fontSize(20).fillColor(blue)
      .text("Table of Contents");
    doc.moveDown(0.8);

    const tocEntries: { sectionNum: number; title: string; y: number; pageIdx: number }[] = [];

    doc.font("Helvetica").fontSize(11).fillColor(blue);
    tocEntries.push({ sectionNum: 1, title: "Introduction", y: doc.y, pageIdx: tocPageStart });
    doc.text("1. Introduction", { underline: true });
    doc.moveDown(0.3);

    sorted.forEach((result, idx) => {
      const sectionNum = idx + 2;
      const title = SECTION_TITLES[result.resultType] || result.title;
      if (doc.y > BOTTOM_LIMIT - 20) {
        doc.addPage();
      }
      const currentTocPage = doc.bufferedPageRange().count - 1;
      tocEntries.push({ sectionNum, title, y: doc.y, pageIdx: currentTocPage });
      doc.font("Helvetica").fontSize(11).fillColor(blue)
        .text(`${sectionNum}. ${title}`, { underline: true });
      doc.moveDown(0.3);
    });

    const sectionPageMap: Map<number, number> = new Map();

    doc.addPage();
    sectionPageMap.set(1, doc.bufferedPageRange().count - 1);
    (doc as any).addNamedDestination("section_1");

    doc.font("Helvetica-Bold").fontSize(20).fillColor(blue)
      .text("1. Introduction");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10.5).fillColor("#333333")
      .text(`This report presents the automated legacy code analysis results for the Delphi/Object Pascal project "${project.name}". The analysis was performed using a multi-agent pipeline that parses source code, constructs semantic knowledge graphs, and applies reasoning to extract architectural insights, design patterns, complexity metrics, and structural relationships.`, { lineGap: 3 });
    doc.moveDown(0.5);

    if (project.sourceUrl) {
      doc.font("Helvetica").fontSize(10.5).fillColor("#333333")
        .text("The source code was obtained from:", { continued: false });
      doc.font("Helvetica").fontSize(10).fillColor(blue)
        .text(project.sourceUrl, { link: project.sourceUrl, underline: true });
      doc.moveDown(0.5);
    } else {
      doc.font("Helvetica").fontSize(10.5).fillColor("#333333")
        .text("The source code was provided via file upload.");
      doc.moveDown(0.5);
    }

    doc.font("Helvetica").fontSize(10.5).fillColor("#333333")
      .text(`The codebase contains ${project.totalFiles || 0} parsed source files, from which ${project.tripleCount || 0} RDF triples were extracted to form a comprehensive knowledge graph. The following sections detail the findings across architecture, dependencies, complexity, design patterns, and visual diagrams.`, { lineGap: 3 });

    sorted.forEach((result, sIdx) => {
      doc.addPage();
      const sectionNum = sIdx + 2;
      const title = SECTION_TITLES[result.resultType] || result.title;

      sectionPageMap.set(sectionNum, doc.bufferedPageRange().count - 1);
      (doc as any).addNamedDestination(`section_${sectionNum}`);

      doc.font("Helvetica-Bold").fontSize(18).fillColor(blue)
        .text(`${sectionNum}. ${title}`);
      doc.moveDown(0.5);

      const { blocks } = sectionParsed[sIdx];

      for (const block of blocks) {
        if (block.type === "heading") {
          const fontSize = block.level === 2 ? 14 : block.level === 3 ? 12 : 10.5;
          ensureSpace(30);
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#222222")
            .text(block.text || "", { lineGap: 2 });
          doc.moveDown(0.3);
        } else if (block.type === "paragraph") {
          const clean = cleanInlineText(block.text || "");
          ensureSpace(20);
          doc.font("Helvetica").fontSize(10).fillColor("#333333")
            .text(clean, { lineGap: 2 });
          doc.moveDown(0.25);
        } else if (block.type === "diagram" && block.diagram) {
          if (block.diagram.imageBuffer) {
            const dim = getPngDimensions(block.diagram.imageBuffer);
            const maxImgHeight = BOTTOM_LIMIT - MARGIN - 40;
            const fitted = fitImageToPage(dim.width, dim.height, CONTENT_WIDTH, maxImgHeight);

            if (doc.y + fitted.height + 30 > BOTTOM_LIMIT) {
              doc.addPage();
            }

            const xOffset = MARGIN + Math.max(0, (CONTENT_WIDTH - fitted.width) / 2);
            doc.image(block.diagram.imageBuffer, xOffset, doc.y, {
              width: fitted.width,
              height: fitted.height,
            });
            doc.y += fitted.height + 5;
            doc.font("Helvetica-Oblique").fontSize(8).fillColor(lightGray)
              .text(`${block.diagram.type === "plantuml" ? "PlantUML" : "Mermaid"} diagram`, { align: "center" });
            doc.moveDown(0.3);
          } else {
            ensureSpace(20);
            doc.font("Helvetica-Oblique").fontSize(9).fillColor(lightGray)
              .text(`[${block.diagram.type === "plantuml" ? "PlantUML" : "Mermaid"} diagram — could not be rendered]`);
            doc.moveDown(0.3);
          }
        } else if (block.type === "list") {
          for (const item of block.items || []) {
            const clean = cleanInlineText(item);
            ensureSpace(18);
            doc.font("Helvetica").fontSize(9.5).fillColor("#333333")
              .text(`  •  ${clean}`, { indent: 12, lineGap: 1 });
            doc.moveDown(0.1);
          }
          doc.moveDown(0.2);
        } else if (block.type === "table" && block.rows && block.rows.length > 0) {
          renderPdfTable(doc, block.rows, CONTENT_WIDTH, MARGIN, BOTTOM_LIMIT);
          doc.moveDown(0.3);
        }
      }
    });

    const totalPages = doc.bufferedPageRange().count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.save();
      doc.font("Helvetica").fontSize(8).fillColor(lightGray);
      const pageText = `Page ${i + 1} of ${totalPages}`;
      const textW = doc.widthOfString(pageText);
      doc.text(pageText, (PAGE_WIDTH - textW) / 2, PAGE_HEIGHT - MARGIN + 10, { lineBreak: false });
      doc.restore();
    }

    for (const entry of tocEntries) {
      doc.switchToPage(entry.pageIdx);
      const targetPage = sectionPageMap.get(entry.sectionNum);
      if (targetPage === undefined) continue;

      doc.save();
      doc.font("Helvetica").fontSize(10).fillColor(lightGray);
      const pageNumStr = `${targetPage + 1}`;
      const numWidth = doc.widthOfString(pageNumStr);
      doc.text(pageNumStr, PAGE_WIDTH - MARGIN - numWidth, entry.y, { lineBreak: false });

      const linkText = `${entry.sectionNum}. ${entry.title}`;
      const linkWidth = doc.font("Helvetica").fontSize(11).widthOfString(linkText);
      (doc as any).goTo(MARGIN, entry.y - 2, linkWidth, 14, `section_${entry.sectionNum}`);
      doc.restore();
    }

    doc.end();
  });
}

function renderPdfTable(doc: InstanceType<typeof PDFDocument>, rows: string[][], contentWidth: number, margin: number, bottomLimit: number) {
  if (rows.length === 0) return;

  const colCount = rows[0].length;
  const colWidth = contentWidth / colCount;
  const cellPadding = 4;
  const fontSize = 8;
  const textWidth = colWidth - cellPadding * 2;

  const maxRows = Math.min(rows.length, 60);

  for (let r = 0; r < maxRows; r++) {
    const cellTexts = Array.from({ length: colCount }, (_, c) => (rows[r][c] || "").substring(0, 100));

    doc.font(r === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    let maxCellHeight = 0;
    for (const text of cellTexts) {
      const h = doc.heightOfString(text, { width: textWidth });
      if (h > maxCellHeight) maxCellHeight = h;
    }
    const rowHeight = Math.max(18, maxCellHeight + cellPadding * 2);

    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      if (r > 0) {
        doc.font("Helvetica-Bold").fontSize(fontSize);
        let headerH = 0;
        const headerTexts = Array.from({ length: colCount }, (_, c) => (rows[0][c] || "").substring(0, 100));
        for (const text of headerTexts) {
          const h = doc.heightOfString(text, { width: textWidth });
          if (h > headerH) headerH = h;
        }
        const headerRowH = Math.max(18, headerH + cellPadding * 2);
        const hy = doc.y;
        doc.rect(margin, hy, contentWidth, headerRowH).fill("#e8edf5");
        for (let c = 0; c < colCount; c++) {
          doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#000000")
            .text(headerTexts[c], margin + c * colWidth + cellPadding, hy + cellPadding, { width: textWidth, lineBreak: true });
        }
        doc.y = hy + headerRowH;
      }
    }

    const y = doc.y;
    if (r === 0) {
      doc.rect(margin, y, contentWidth, rowHeight).fill("#e8edf5");
    } else if (r % 2 === 0) {
      doc.rect(margin, y, contentWidth, rowHeight).fill("#f8f9fa");
    }

    doc.rect(margin, y, contentWidth, rowHeight).lineWidth(0.5).strokeColor("#dddddd").stroke();

    for (let c = 0; c < colCount; c++) {
      doc.font(r === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize).fillColor("#000000")
        .text(cellTexts[c], margin + c * colWidth + cellPadding, y + cellPadding, { width: textWidth, lineBreak: true });
    }

    doc.y = y + rowHeight;
  }

  if (rows.length > maxRows) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#999999")
      .text(`... and ${rows.length - maxRows} more rows`);
  }
}
