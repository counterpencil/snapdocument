/**
 * 스냅문서 Worker — API 서버
 */

interface Env {
  BUCKET: R2Bucket;
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
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

// ─── 모의 템플릿 저장소 (MVP: 메모리, 나중에 D1) ───
const templates = new Map<string, Template>();

// 기본 템플릿 추가
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

// ─── 모의 DeepSeek 매핑 (MVP: 패턴 기반, 나중에 실제 LLM 교체) ───
function mockLLMMap(text: string, columns: TemplateColumn[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const col of columns) {
    result[col.header] = extractValue(text, col);
  }

  return result;
}

function extractValue(text: string, col: TemplateColumn): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 공통: "컬럼명: 값" 또는 "컬럼명 : 값" 패턴 먼저 검사
  const labelVariants = [col.header];
  if (col.description) labelVariants.push(col.description);

  for (const label of labelVariants) {
    for (const line of lines) {
      const pattern = new RegExp(`${escapeRegex(label)}\\s*[:：]\\s*(.+)`);
      const match = line.match(pattern);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
  }

  // "컬럼명 값" (공백 구분) 패턴
  for (const label of labelVariants) {
    for (const line of lines) {
      if (line.startsWith(label)) {
        const rest = line.slice(label.length).trim();
        if (rest && !rest.startsWith(':') && !rest.startsWith('：')) {
          return rest;
        }
      }
    }
  }

  switch (col.type) {
    case 'date': {
      const dateMatch = text.match(/(\d{4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}[일]?)/);
      return dateMatch ? dateMatch[1] : '';
    }
    case 'number': {
      const numMatch = text.match(/([\d.]+)/);
      return numMatch ? numMatch[1] : '';
    }
    case 'text': {
      if (col.header === '성명' || col.header === '방문자' || col.description.includes('이름')) {
        // 한국 이름: 3글자 선호, 성씨+1~2글자
        const names: string[] = [];
        const re = /([김김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허남심노하곽성차주우구민진지나염변여원채천방공편염석][가-힣]{1,3})/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          // 컬럼 헤더 자체는 제외 (성명, 이름, 방문자 등)
          const word = m[1];
          if (!labelVariants.includes(word)) {
            names.push(word);
          }
        }
        // 가장 긴 이름 선호 (보통 3글자 이름)
        names.sort((a, b) => b.length - a.length);
        return names[0] || '';
      }
      return '';
    }
    default:
      return '';
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 라우터 ───
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // POST /api/templates — 템플릿 등록
    if (path === '/api/templates' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; columns: TemplateColumn[] };
        const id = crypto.randomUUID();
        const template: Template = {
          id,
          name: body.name,
          columns: body.columns,
        };
        templates.set(id, template);
        return jsonResponse({ template });
      } catch (e) {
        return jsonResponse({ error: 'Invalid request' }, 400);
      }
    }

    // GET /api/templates — 템플릿 목록
    if (path === '/api/templates' && request.method === 'GET') {
      const list = Array.from(templates.values()).map(({ id, name, columns }) => ({
        id,
        name,
        columnCount: columns.length,
      }));
      return jsonResponse({ templates: list });
    }

    // POST /api/analyze — 텍스트 → 컬럼 매핑
    if (path === '/api/analyze' && request.method === 'POST') {
      try {
        const body = await request.json() as AnalyzeRequest;
        const template = templates.get(body.templateId);
        if (!template) {
          return jsonResponse({ error: 'Template not found' }, 404);
        }

        const mapped = mockLLMMap(body.text, template.columns);

        // R2에 결과 저장
        const resultId = crypto.randomUUID();
        const resultData = {
          id: resultId,
          templateId: template.id,
          templateName: template.name,
          mappedData: mapped,
          createdAt: new Date().toISOString(),
        };

        // R2 저장 (나중에 실제 R2 바인딩 추가 시 활성화)
        // await env.BUCKET.put(`results/${resultId}.json`, JSON.stringify(resultData));

        return jsonResponse({
          result: resultData,
          pcUrl: `https://snapdocument.pages.dev/r/${resultId}`,
        });
      } catch (e) {
        return jsonResponse({ error: 'Analysis failed' }, 500);
      }
    }

    // GET /r/:id — 결과 조회 (PC에서 보기)
    if (path.startsWith('/r/') && request.method === 'GET') {
      const id = path.split('/r/')[1];
      // 나중에 R2에서 조회
      return jsonResponse({ message: 'Results expire after 24 hours. R2 lookup pending.' }, 404);
    }

    // 404
    return jsonResponse({ error: 'Not found' }, 404);
  },
};
