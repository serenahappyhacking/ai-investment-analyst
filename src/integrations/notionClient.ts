/**
 * Notion Integration
 * ===================
 * Saves investment reports as Notion pages via the official API.
 * Requires: NOTION_API_KEY + NOTION_DATABASE_ID in .env
 *
 * The database should have these properties (auto-created if missing):
 *   - Title (title)        — report title
 *   - Date (date)          — report generation date
 *   - Risk Score (number)  — 1-10 risk score
 *   - Tags (multi_select)  — sector/industry tags
 *   - Status (select)      — "New" | "Reviewed"
 */

import { Client } from "@notionhq/client";

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? "";
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? "";

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    if (!NOTION_API_KEY) throw new Error("NOTION_API_KEY not set");
    client = new Client({ auth: NOTION_API_KEY });
  }
  return client;
}

export function isNotionConfigured(): boolean {
  return !!(NOTION_API_KEY && NOTION_DATABASE_ID);
}

/**
 * Save an investment report to a Notion database page.
 * Returns the URL of the created page.
 */
export async function saveReportToNotion(params: {
  company: string;
  report: string;
  riskScore?: number;
  tags?: string[];
}): Promise<{ pageUrl: string; pageId: string }> {
  const notion = getClient();
  const today = new Date().toISOString().split("T")[0];

  // Create the page with properties
  const page = await notion.pages.create({
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      // Title property (every DB has one)
      title: {
        title: [{ text: { content: `${params.company} Investment Analysis` } }],
      },
      ...(params.riskScore != null && {
        "Risk Score": { number: params.riskScore },
      }),
      ...(params.tags && params.tags.length > 0 && {
        Tags: {
          multi_select: params.tags.map((t) => ({ name: t })),
        },
      }),
    },
  });

  // Append the report body as blocks (Notion has a 2000-char limit per block)
  const blocks = markdownToNotionBlocks(params.report);

  // Notion allows max 100 blocks per append request
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: page.id,
      children: blocks.slice(i, i + 100) as any,
    });
  }

  const pageUrl = `https://notion.so/${page.id.replace(/-/g, "")}`;
  return { pageUrl, pageId: page.id };
}

/**
 * Convert markdown text to Notion blocks.
 * Handles headings, paragraphs, and preserves tables as code blocks.
 */
function markdownToNotionBlocks(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: any[] = [];
  let buffer = "";
  let inTable = false;

  function flushBuffer() {
    if (!buffer.trim()) { buffer = ""; return; }
    // Split into 2000-char chunks
    const text = buffer.trim();
    for (let i = 0; i < text.length; i += 2000) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: text.slice(i, i + 2000) } }],
        },
      });
    }
    buffer = "";
  }

  for (const line of lines) {
    // Table rows
    if (line.trim().startsWith("|")) {
      if (!inTable) { flushBuffer(); inTable = true; }
      buffer += line + "\n";
      continue;
    }
    if (inTable) {
      // End of table — emit as code block for readability
      blocks.push({
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: buffer.trim().slice(0, 2000) } }],
          language: "markdown",
        },
      });
      buffer = "";
      inTable = false;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);

    if (h1) {
      flushBuffer();
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: h1[1].slice(0, 2000) } }] },
      });
    } else if (h2) {
      flushBuffer();
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: h2[1].slice(0, 2000) } }] },
      });
    } else if (h3) {
      flushBuffer();
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: h3[1].slice(0, 2000) } }] },
      });
    } else if (line.trim() === "---") {
      flushBuffer();
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else {
      buffer += line + "\n";
    }
  }

  // Flush remaining
  if (inTable) {
    blocks.push({
      object: "block",
      type: "code",
      code: {
        rich_text: [{ type: "text", text: { content: buffer.trim().slice(0, 2000) } }],
        language: "markdown",
      },
    });
  } else {
    flushBuffer();
  }

  return blocks;
}
