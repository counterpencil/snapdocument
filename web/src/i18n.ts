// i18n — 브라우저 언어 자동 감지 + 수동 전환
const KO: Record<string, string> = {
  'beta': '테스트 사이트',
  'logo': '스냅문서',
  'subtitle': '정보 문서를 원하는 양식으로 변환',
  'template.title': '템플릿 (문서 양식)',
  'template.upload': '새 엑셀 양식 올리기',
  'template.hint': '.xlsx, .xls — 컬럼 헤더를 자동 분석합니다',
  'template.fileSelected': '파일 선택됨',
  'template.clickOrDrag': '클릭 또는 드래그',
  'template.register': '이 양식 등록하기',
  'template.cancel': '취소',
  'doc.title': '정보 문서',
  'doc.upload': '정보 문서 올리기 (.xlsx, .xls)',
  'doc.hint': '또는 아래에 텍스트를 직접 입력하세요',
  'doc.fileSelected': '파일 선택됨',
  'doc.clickOrDrag': '클릭 또는 드래그',
  'doc.placeholder': '이름: 홍길동\n생년월일: 1960-05-20\n연락처: 010-1234-5678\n...',
  'doc.preview': '업로드 문서 미리보기',
  'convert': '변환 실행',
  'converting': '변환 중...',
  'result.title': '변환 결과',
  'result.download': '결과 엑셀 다운로드',
  'footer': '테스트 사이트 — 데이터는 24시간 후 자동 삭제됩니다',
  'error.server': '서버 연결 실패',
};

const EN: Record<string, string> = {
  'beta': 'Test Site',
  'logo': 'SnapDocument',
  'subtitle': 'Transform documents into any format',
  'template.title': 'Template (Document Format)',
  'template.upload': 'Upload new Excel template',
  'template.hint': '.xlsx, .xls — columns will be auto-analyzed',
  'template.fileSelected': 'File selected',
  'template.clickOrDrag': 'Click or drag',
  'template.register': 'Register this template',
  'template.cancel': 'Cancel',
  'doc.title': 'Source Document',
  'doc.upload': 'Upload source document (.xlsx, .xls)',
  'doc.hint': 'Or paste text directly below',
  'doc.fileSelected': 'File selected',
  'doc.clickOrDrag': 'Click or drag',
  'doc.placeholder': 'Name: John Doe\nDOB: 1990-01-15\nPhone: 010-1234-5678\n...',
  'doc.preview': 'Uploaded Document Preview',
  'convert': 'Convert',
  'converting': 'Converting...',
  'result.title': 'Result',
  'result.download': 'Download Result Excel',
  'footer': 'Test Site — data is deleted after 24 hours',
  'error.server': 'Server connection failed',
};

type Locale = 'ko' | 'en';

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'ko';
  const saved = localStorage.getItem('snapdoc-locale');
  if (saved === 'ko' || saved === 'en') return saved;
  const lang = navigator.language || '';
  return lang.startsWith('ko') ? 'ko' : 'en';
}

let currentLocale: Locale = 'ko';
let t: (key: string) => string = (k) => KO[k] || k;

export function initLocale() {
  currentLocale = detectLocale();
  const dict = currentLocale === 'ko' ? KO : EN;
  t = (k: string) => dict[k] || k;
  return currentLocale;
}

export function getLocale() { return currentLocale; }
export function setLocale(l: Locale) {
  currentLocale = l;
  const dict = l === 'ko' ? KO : EN;
  t = (k: string) => dict[k] || k;
  localStorage.setItem('snapdoc-locale', l);
}

export { t };
