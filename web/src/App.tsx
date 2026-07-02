import { useState, useCallback, useEffect, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import { buildSpreadsheetPreviewHtml } from './utils/spreadsheetRichPreview';
import { initLocale, getLocale, setLocale, t } from './i18n';
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

// Worker URL — 배포 시 실제 Worker URL로 변경
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://snapdocument-worker.counterpencil.workers.dev';

function App() {
  const [locale, setLocaleState] = useState(initLocale());
  const toggleLocale = () => {
    const next = getLocale() === 'ko' ? 'en' : 'ko';
    setLocale(next);
    setLocaleState(next);
  };

  // 템플릿
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateColumns, setTemplateColumns] = useState<Column[]>([]);
  const [templatePreviewHtml, setTemplatePreviewHtml] = useState('');
  const [templateFileName, setTemplateFileName] = useState('');
  const [templateDragOver, setTemplateDragOver] = useState(false);

  // 정보 문서
  const [inputText, setInputText] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [docPreviewHtml, setDocPreviewHtml] = useState('');
  const [docDragOver, setDocDragOver] = useState(false);

  // 결과
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ mappedData: Record<string, string>; templateName: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${WORKER_URL}/api/templates`).then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  const selectedTemplate = templates.find(r => r.id === selectedTemplateId);

  const handleTemplateFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) return;
    setTemplateFileName(file.name);
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (!rows.length) return;

    let bestRow = rows[0];
    let bestCount = bestRow.filter((c: unknown) => c != null && String(c).trim()).length;
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      const count = row.filter((c: unknown) => c != null && String(c).trim()).length;
      if (count > bestCount) { bestRow = row; bestCount = count; }
    }

    const headers = bestRow.filter((c: unknown) => c != null && String(c).trim()).map((c: unknown) => String(c).trim());
    if (!headers.length) return;

    setTemplateColumns(headers.map((h, i) => ({ index: i, header: h, type: guessType(h), description: '' })));
    setSelectedTemplateId('');

    const preview = await buildSpreadsheetPreviewHtml(data);
    if ('html' in preview) setTemplatePreviewHtml(preview.html);
    else {
      try {
        const basic = XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[0]]);
        setTemplatePreviewHtml(`<div class="spreadsheet-sheet-wrap">${basic.replace(/<table\b/i, '<table class="spreadsheet-preview-table"')}</div>`);
      } catch { setTemplatePreviewHtml(''); }
    }
  }, []);

  const handleTemplateDrop = useCallback((e: DragEvent) => { e.preventDefault(); setTemplateDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleTemplateFile(f); }, [handleTemplateFile]);

  const handleTemplateSave = async () => {
    await fetch(`${WORKER_URL}/api/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateFileName.replace(/\.(xlsx|xls)$/i, ''), columns: templateColumns }),
    }).catch(() => {});
    setTemplateColumns([]); setTemplatePreviewHtml(''); setTemplateFileName('');
    fetch(`${WORKER_URL}/api/templates`).then(r => r.json()).then(d => setTemplates(d.templates || []));
  };

  const handleDocFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) return;
    setDocFileName(file.name);
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const texts: string[] = [];
    for (const row of rows) for (const cell of row) if (cell != null && String(cell).trim()) texts.push(String(cell).trim());
    setInputText(texts.join('\n'));
    const basic = XLSX.utils.sheet_to_html(sheet);
    setDocPreviewHtml(basic.replace(/<table\b/i, '<table class="spreadsheet-preview-table"'));
  }, []);

  const handleDocDrop = useCallback((e: DragEvent) => { e.preventDefault(); setDocDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleDocFile(f); }, [handleDocFile]);

  const effectiveColumns = selectedTemplate ? selectedTemplate.columns : templateColumns;
  const effectiveTemplateName = selectedTemplate ? selectedTemplate.name : templateFileName.replace(/\.(xlsx|xls)$/i, '');
  const canAnalyze = inputText.trim() && effectiveColumns.length > 0;

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setLoading(true); setError(''); setResult(null);
    try {
      if (selectedTemplate) {
        const res = await fetch(`${WORKER_URL}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: inputText, templateId: selectedTemplateId }) });
        const d = await res.json();
        if (d.result) setResult({ mappedData: d.result.mappedData, templateName: effectiveTemplateName });
        else setError(d.error || 'error');
      }
    } catch { setError(t('error.server')); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (!result) return;
    const headerRow = effectiveColumns.map(c => c.header);
    const dataRow = effectiveColumns.map(c => result.mappedData[c.header] || '');
    const ws = XLSX.utils.aoa_to_sheet([headerRow, dataRow]);
    ws['!cols'] = effectiveColumns.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${result.templateName}_result.xlsx`);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="top-row">
          <div className="beta-badge">{t('beta')}</div>
          <button className="lang-toggle" onClick={toggleLocale}>
            {locale === 'ko' ? 'EN' : '한글'}
          </button>
        </div>
        <h1 className="logo">{t('logo')}</h1>
        <p className="subtitle">{t('subtitle')}</p>
      </header>

      <main className="main">
        {/* 템플릿 */}
        <section className="section">
          <h2 className="step-title">{t('template.title')}</h2>

          {templates.length > 0 && templateColumns.length === 0 && (
            <div className="template-grid">
              {templates.map(r => (
                <button key={r.id} className={`template-card ${selectedTemplateId === r.id ? 'template-card--active' : ''}`}
                  onClick={() => { setSelectedTemplateId(r.id); setTemplateColumns([]); setTemplatePreviewHtml(''); }}>
                  <span className="template-card__name">{r.name}</span>
                  <span className="template-card__count">{r.columnCount} columns</span>
                </button>
              ))}
            </div>
          )}

          {!selectedTemplate && (
            <label className={`dropzone ${templateDragOver ? 'dropzone--active' : ''}`}
              onDrop={handleTemplateDrop}
              onDragOver={e => { e.preventDefault(); setTemplateDragOver(true); }}
              onDragLeave={() => setTemplateDragOver(false)}>
              <input type="file" accept=".xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) handleTemplateFile(f); }} className="dropzone__input" />
              <div className="dropzone__icon">{templateFileName ? t('template.fileSelected') : t('template.clickOrDrag')}</div>
              <p className="dropzone__text">{templateFileName || t('template.upload')}</p>
              <p className="dropzone__hint">{t('template.hint')}</p>
            </label>
          )}

          {templateColumns.length > 0 && !selectedTemplate && (
            <div className="inline-preview">
              <div className="column-list">{templateColumns.map(c => <span key={c.index} className="column-item">{c.header}</span>)}</div>
              <button className="btn btn--sm btn--primary" onClick={handleTemplateSave}>{t('template.register')}</button>
              <button className="btn btn--sm btn--outline" onClick={() => { setTemplateColumns([]); setTemplatePreviewHtml(''); setTemplateFileName(''); }}>{t('template.cancel')}</button>
            </div>
          )}

          {templatePreviewHtml && <div className="spreadsheet-preview" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: templatePreviewHtml }} />}
        </section>

        {/* 정보 문서 */}
        <section className="section">
          <h2 className="step-title">{t('doc.title')}</h2>
          <label className={`dropzone ${docDragOver ? 'dropzone--active' : ''}`}
            onDrop={handleDocDrop}
            onDragOver={e => { e.preventDefault(); setDocDragOver(true); }}
            onDragLeave={() => setDocDragOver(false)}>
            <input type="file" accept=".xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }} className="dropzone__input" />
            <div className="dropzone__icon">{docFileName ? t('doc.fileSelected') : t('doc.clickOrDrag')}</div>
            <p className="dropzone__text">{docFileName || t('doc.upload')}</p>
            <p className="dropzone__hint">{t('doc.hint')}</p>
          </label>
          <textarea className="input input--textarea" value={inputText} onChange={e => setInputText(e.target.value)} placeholder={t('doc.placeholder')} rows={5} />
        </section>

        {docPreviewHtml && (
          <section className="section">
            <h2 className="step-title">{t('doc.preview')}</h2>
            <div className="spreadsheet-preview" dangerouslySetInnerHTML={{ __html: docPreviewHtml }} />
          </section>
        )}

        <button className="btn btn--primary" onClick={handleAnalyze} disabled={!canAnalyze || loading}>
          {loading ? t('converting') : t('convert')}
        </button>

        {error && <div className="error-msg">{error}</div>}

        {result && (
          <>
            <section className="section">
              <h2 className="step-title">{t('result.title')} — {result.templateName}</h2>
              <table className="result-table">
                <thead><tr>{effectiveColumns.map(c => <th key={c.index}>{c.header}</th>)}</tr></thead>
                <tbody><tr>{effectiveColumns.map(c => <td key={c.index}>{result.mappedData[c.header] || '-'}</td>)}</tr></tbody>
              </table>
            </section>
            <button className="btn btn--primary" onClick={handleDownload}>{t('result.download')}</button>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="footer__test">{t('footer')}</div>
      </footer>
    </div>
  );
}

function guessType(header: string): string {
  const h = header.toLowerCase();
  if (/날짜|일자|일시|date|dob|생년월일/.test(h)) return 'date';
  if (/금액|가격|단가|합계|비용|체온|혈압|키|몸무게|온도|개수|수량|amount|price/.test(h)) return 'number';
  return 'text';
}

export default App;
