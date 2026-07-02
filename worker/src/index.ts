/**
 * 스냅문서 Worker — API 서버 (DeepSeek LLM)
 */

interface Env {
  BUCKET?: R2Bucket;
  DEEPSEEK_KEY?: string;
}

interface TemplateColumn {
  index: number;
  header: string;
  type: string;
  description: string;
}

interface Template {
  id: string;
  name: string;
  columns: TemplateColumn[];
}

interface AnalyzeRequest {
  text: string;
  templateId: string;
}

// ─── CORS ───
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ─── 템플릿 저장소 (메모리, 나중에 D1) ───
const templates = new Map<string, Template>();

templates.set('health-check', {
  id: 'health-check',
  name: '건강체크리스트',
  columns: [
    { index: 0, header: '날짜', type: 'date', description: '측정 날짜' },
    { index: 1, header: '성명', type: 'text', description: '대상자 이름' },
    { index: 2, header: '체온', type: 'number', description: '체온(℃)' },
    { index: 3, header: '수축기혈압', type: 'number', description: '수축기 혈압' },
    { index: 4, header: '이완기혈압', type: 'number', description: '이완기 혈압' },
    { index: 5, header: '비고', type: 'text', description: '특이사항' },
  ],
});

templates.set('visit-log', {
  id: 'visit-log',
  name: '면회기록부',
  columns: [
    { index: 0, header: '방문일', type: 'date', description: '방문 날짜' },
    { index: 1, header: '방문자', type: 'text', description: '방문자 성명' },
    { index: 2, header: '관계', type: 'text', description: '입소자와의 관계' },
    { index: 3, header: '방문시간', type: 'text', description: '방문 시작~종료' },
  ],
});

// ─── DeepSeek LLM 매핑 ───
async function deepseekMap(
  text: string,
  columns: TemplateColumn[],
  apiKey: string,
): Promise<Record<string, string>> {
  const columnList = columns
    .map((c) => `- ${c.header} (${c.type}): ${c.description}`)
    .join('\n');

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `너는 텍스트에서 주어진 컬럼에 맞는 값을 찾아 매핑하는 도우미다. 반드시 JSON 객체만 출력해라. 찾을 수 없는 값은 빈 문자열("")로. 키는 반드시 주어진 컬럼명 그대로 사용해라.`,
        },
        {
          role: 'user',
          content: `다음 텍스트에서 각 컬럼에 맞는 값을 찾아 JSON으로 반환해줘:\n\n텍스트:\n"""\n${text}\n"""\n\n컬럼:\n${columnList}\n\nJSON만 출력:`,
        },
      ],
      temperature: 0,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices?.[0]?.message?.content || '{}';
  // JSON 블록 추출 (```json ... ``` 감싸진 경우 대비)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(jsonStr);
    // 모든 컬럼에 대해 값이 없으면 빈 문자열
    const result: Record<string, string> = {};
    for (const col of columns) {
      result[col.header] = String(parsed[col.header] ?? '').trim();
    }
    return result;
  } catch {
    // JSON 파싱 실패 시 모의 매퍼로 폴백
    return mockMap(text, columns);
  }
}

// ─── 모의 매퍼 (DeepSeek 없을 때 폴백) ───
function mockMap(text: string, columns: TemplateColumn[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const col of columns) {
    result[col.header] = extractByPattern(text, col);
  }
  return result;
}

function extractByPattern(text: string, col: TemplateColumn): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const labels = [col.header];
  if (col.description) labels.push(col.description);

  // "컬럼명: 값" 패턴
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const line of lines) {
      const m = line.match(new RegExp(`${escaped}\\s*[:：]\\s*(.+)`));
      if (m?.[1]?.trim()) return m[1].trim();
    }
  }
  // "컬럼명 값" 패턴
  for (const label of labels) {
    for (const line of lines) {
      if (line.startsWith(label)) {
        const rest = line.slice(label.length).trim();
        if (rest && !rest.startsWith(':') && !rest.startsWith('：')) return rest;
      }
    }
  }

  if (col.type === 'date') {
    const m = text.match(/(\d{4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}[일]?)/);
    return m?.[1] ?? '';
  }
  if (col.type === 'number') {
    const m = text.match(/([\d.]+)/);
    return m?.[1] ?? '';
  }
  return '';
}

// ─── 라우터 ───
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // POST /api/templates
    if (path === '/api/templates' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; columns: TemplateColumn[] };
        const template: Template = {
          id: crypto.randomUUID(),
          name: body.name,
          columns: body.columns,
        };
        templates.set(template.id, template);
        return jsonResponse({ template });
      } catch {
        return jsonResponse({ error: 'Invalid request' }, 400);
      }
    }

    // GET /api/templates
    if (path === '/api/templates' && request.method === 'GET') {
      const list = Array.from(templates.values()).map(({ id, name, columns }) => ({
        id, name, columns, columnCount: columns.length,
      }));
      return jsonResponse({ templates: list });
    }

    // POST /api/analyze
    if (path === '/api/analyze' && request.method === 'POST') {
      try {
        const body = await request.json() as AnalyzeRequest;
        const template = templates.get(body.templateId);
        if (!template) return jsonResponse({ error: 'Template not found' }, 404);

        let mapped: Record<string, string>;
        if (env.DEEPSEEK_KEY) {
          mapped = await deepseekMap(body.text, template.columns, env.DEEPSEEK_KEY);
        } else {
          mapped = mockMap(body.text, template.columns);
        }

        const resultId = crypto.randomUUID();
        return jsonResponse({
          result: {
            id: resultId,
            templateId: template.id,
            templateName: template.name,
            mappedData: mapped,
            createdAt: new Date().toISOString(),
          },
          pcUrl: `https://snapdocument.pages.dev/r/${resultId}`,
        });
      } catch (e) {
        return jsonResponse({ error: 'Analysis failed' }, 500);
      }
    }

    // GET /r/:id
    if (path.startsWith('/r/') && request.method === 'GET') {
      return jsonResponse({ message: '24h TTL. R2 pending.' }, 404);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
