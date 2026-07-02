import { useState, useCallback, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { buildSpreadsheetPreviewHtml } from './utils/spreadsheetRichPreview';
import './App.css';

interface Column {
  index: number;
  header: string;
  type: string;
  description: string;
}

interface Template {
  id: string;
  name: string;
  columns: Column[];
  columnCount?: number;
}

const WORKER_URL = 'https://snapdocument-worker.counterpencil.workers.dev';

function App() {
  const [tab, setTab] = useState<'template' | 'convert'>('template');

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">스냅문서</h1>
        <p className="subtitle">찍으면 문서가 됩니다</p>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'template' ? 'tab--active' : ''}`}
          onClick={() => setTab('template')}
        >
          📋 템플릿 등록
        </button>
        <button
          className={`tab ${tab === 'convert' ? 'tab--active' : ''}`}
          onClick={() => setTab('convert')}
        >
          ✨ 문서 변환
        </button>
      </nav>

      <main className="main">
        {tab === 'template' ? <TemplateRegister /> : <DocumentConvert />}
      </main>

      <footer className="footer">
        <div className="footer__download">
          <span>📱 앱 다운로드:</span>
          <a href="#" className="footer__link">App Store</a>
          <a href="#" className="footer__link">Google Play</a>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════ 템플릿 등록 ═══════════ */

function TemplateRegister() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [fileName, setFileName] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('엑셀 파일(.xlsx, .xls)만 업로드할 수 있어요.');
      return;
    }
    setFileName(file.name);
    setTemplateName(cleanTemplateName(file.name));

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    if (rows.length === 0) { alert('엑셀 파일이 비어있어요.'); return; }

    let bestRow = rows[0];
    let bestCount = bestRow.filter((c) => c != null && String(c).trim() !== '').length;
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      const count = row.filter((c) => c != null && String(c).trim() !== '').length;
      if (count > bestCount) { bestRow = row; bestCount = count; }
    }

    const headers = bestRow.filter((c) => c != null && String(c).trim() !== '').map((c) => String(c).trim());
    if (headers.length === 0) { alert('컬럼을 찾을 수 없어요.'); return; }

    setColumns(headers.map((h, i) => ({ index: i, header: h, type: guessType(h), description: '' })));

    const preview = await buildSpreadsheetPreviewHtml(data);
    if ('html' in preview) {
      setPreviewHtml(preview.html);
    } else {
      try {
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const basicHtml = XLSX.utils.sheet_to_html(ws);
        setPreviewHtml(`<div class="spreadsheet-sheet-wrap">${basicHtml.replace(/<table\b/i, '<table class="spreadsheet-preview-table"')}</div>`);
      } catch { setPreviewHtml(''); }
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }, [handleFile]);
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFile(f); }, [handleFile]);

  const handleSave = async () => {
    setSaved(true);
    try {
      await fetch(`${WORKER_URL}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, columns }),
      });
    } catch { /* worker offline */ }
  };

  const handleDownload = () => {
    const ws = XLSX.utils.aoa_to_sheet([columns.map(c => c.header)]);
    ws['!cols'] = columns.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${templateName || '템플릿'}.xlsx`);
  };

  const handleReset = () => { setColumns([]); setTemplateName(''); setFileName(''); setSaved(false); setPreviewHtml(''); };

  if (columns.length === 0) return (
    <section className="section">
      <h2 className="step-title">① 엑셀 파일 올리기</h2>
      <label className={`dropzone ${dragOver ? 'dropzone--active' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)}>
        <input type="file" accept=".xlsx,.xls" onChange={handleInputChange} className="dropzone__input" />
        <div className="dropzone__icon">📁</div>
        <p className="dropzone__text">엑셀 파일을 드래그하거나 클릭해서 선택하세요</p>
        <p className="dropzone__hint">.xlsx, .xls 파일만 가능</p>
      </label>
    </section>
  );

  if (saved) return (
    <>
      <section className="section section--done">
        <div className="done-icon">✅</div>
        <h2>템플릿이 저장되었어요</h2>
        <p className="done-name">{templateName}</p>
        <p className="done-desc">이제 앱 또는 PC에서 이 템플릿을 선택할 수 있어요.</p>
      </section>
      <section className="section">
        <h2 className="step-title">📋 등록된 컬럼</h2>
        <div className="column-list">{columns.map(c => <div key={c.index} className="column-item"><span className="column-item__type">{typeLabel(c.type)}</span><span className="column-item__name">{c.header}</span></div>)}</div>
      </section>
      <button className="btn btn--primary" onClick={handleDownload}>📥 템플릿 엑셀 다운로드</button>
      <button className="btn btn--outline" onClick={handleReset}>다른 템플릿 등록하기</button>
    </>
  );

  return (
    <>
      <section className="section">
        <h2 className="step-title">② AI가 컬럼을 분석했어요 <span className="file-badge">{fileName}</span></h2>
        <div className="column-list">{columns.map(c => <div key={c.index} className="column-item"><span className="column-item__type">{typeLabel(c.type)}</span><span className="column-item__name">{c.header}</span></div>)}</div>
        <p className="hint">컬럼명이 잘못 분석되었다면 PC에서 직접 수정할 수 있어요 (추후 기능)</p>
      </section>
      {previewHtml && <section className="section"><h2 className="step-title">📊 문서 미리보기</h2><div className="spreadsheet-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} /></section>}
      <section className="section">
        <h2 className="step-title">③ 템플릿 이름</h2>
        <input type="text" className="input" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="예: 건강체크리스트" />
      </section>
      <button className="btn btn--primary" onClick={handleSave} disabled={!templateName.trim()}>템플릿 저장하기</button>
    </>
  );
}

/* ═══════════ 문서 변환 ═══════════ */

function DocumentConvert() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ mappedData: Record<string, string>; pcUrl?: string } | null>(null);
  const [error, setError] = useState('');
  const [filePreviewHtml, setFilePreviewHtml] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER_URL}/api/templates`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* offline */ }
  }, []);

  useState(() => { loadTemplates(); });

  const selected = templates.find(t => t.id === selectedId);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('엑셀 파일(.xlsx, .xls)만 업로드할 수 있어요.');
      return;
    }
    setFileName(file.name);
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    // 모든 셀을 텍스트로 변환
    const texts: string[] = [];
    for (const row of rows) {
      for (const cell of row) {
        if (cell != null && String(cell).trim()) texts.push(String(cell).trim());
      }
    }
    setInputText(texts.join('\n'));

    // 미리보기 HTML 생성
    const basicHtml = XLSX.utils.sheet_to_html(sheet);
    setFilePreviewHtml(basicHtml.replace(/<table\b/i, '<table class="spreadsheet-preview-table"'));
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  const handleAnalyze = async () => {
    if (!inputText.trim() || !selectedId) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${WORKER_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, templateId: selectedId }),
      });
      const data = await res.json();
      if (data.result) {
        setResult({ mappedData: data.result.mappedData, pcUrl: data.pcUrl });
      } else {
        setError(data.error || '분석 실패');
      }
    } catch {
      setError('서버 연결 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadResult = () => {
    if (!result || !selected) return;
    const headerRow = selected.columns.map(c => c.header);
    const dataRow = selected.columns.map(c => result.mappedData[c.header] || '');
    const ws = XLSX.utils.aoa_to_sheet([headerRow, dataRow]);
    ws['!cols'] = selected.columns.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${selected.name}_결과.xlsx`);
  };

  return (
    <>
      <section className="section">
        <h2 className="step-title">① 템플릿 선택</h2>
        {templates.length === 0 ? (
          <p className="muted">등록된 템플릿이 없어요. 「템플릿 등록」 탭에서 먼저 엑셀 양식을 올려주세요.</p>
        ) : (
          <div className="template-grid">
            {templates.map(t => (
              <button key={t.id} className={`template-card ${selectedId === t.id ? 'template-card--active' : ''}`} onClick={() => setSelectedId(t.id)}>
                <span className="template-card__name">{t.name}</span>
                <span className="template-card__count">{t.columnCount}개 컬럼</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="step-title">② 정보 문서 업로드</h2>
        <label className={`dropzone ${dragOver ? 'dropzone--active' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          <input type="file" accept=".xlsx,.xls" onChange={handleInputChange} className="dropzone__input" />
          <div className="dropzone__icon">{fileName ? '📄' : '📁'}</div>
          <p className="dropzone__text">
            {fileName ? fileName : '엑셀 파일을 드래그하거나 클릭하세요'}
          </p>
          <p className="dropzone__hint">.xlsx, .xls — 셀 내용을 텍스트로 추출해 매핑합니다</p>
        </label>

        <div className="input-divider">
          <span>또는 텍스트 직접 입력</span>
        </div>

        <textarea
          className="input input--textarea"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={`예시:\n이름: 홍길동\n생년월일: 1960-05-20\n체온: 36.5\n...`}
          rows={6}
        />
      </section>

      {filePreviewHtml && (
        <section className="section">
          <h2 className="step-title">📊 업로드 문서 미리보기</h2>
          <div className="spreadsheet-preview" dangerouslySetInnerHTML={{ __html: filePreviewHtml }} />
        </section>
      )}

      <button className="btn btn--primary" onClick={handleAnalyze} disabled={!inputText.trim() || !selectedId || loading}>
        {loading ? '분석 중...' : '✨ 변환 실행'}
      </button>

      {error && <div className="error-msg">{error}</div>}

      {result && selected && (
        <>
          <section className="section">
            <h2 className="step-title">📊 매핑 결과 — {selected.name}</h2>
            <table className="result-table">
              <thead>
                <tr>{selected.columns.map(c => <th key={c.index}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{selected.columns.map(c => <td key={c.index}>{result.mappedData[c.header] || '-'}</td>)}</tr>
              </tbody>
            </table>
            {result.pcUrl && <p className="hint" style={{ marginTop: 8 }}>🔗 PC 링크: {result.pcUrl}</p>}
          </section>
          <button className="btn btn--primary" onClick={handleDownloadResult}>📥 결과 엑셀 다운로드</button>
        </>
      )}
    </>
  );
}

/* ═══════════ 유틸 ═══════════ */

function cleanTemplateName(filename: string): string {
  let name = filename.replace(/\.(xlsx|xls)$/i, '');
  name = name.replace(/^\d+_+/, '').replace(/^_+/, '').replace(/_+/g, ' ').trim();
  if (/^[\d.\s]+$/.test(name) || name === '') return '';
  return name;
}

function guessType(header: string): string {
  const h = header.toLowerCase();
  if (/날짜|일자|일시|date|생년월일/.test(h)) return 'date';
  if (/금액|가격|단가|합계|비용|체온|혈압|키|몸무게|온도|개수|수량|amount|price/.test(h)) return 'number';
  return 'text';
}

function typeLabel(type: string): string {
  switch (type) { case 'date': return '📅'; case 'number': return '🔢'; default: return '📝'; }
}

export default App;
