import { useState, useCallback, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import './App.css';

interface Column {
  index: number;
  header: string;
  type: string;
  description: string;
}

function App() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [fileName, setFileName] = useState('');
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

    if (rows.length === 0) {
      alert('엑셀 파일이 비어있어요.');
      return;
    }

    // 헤더 행 찾기: 가장 많은 값이 있는 행을 헤더로 사용
    // (첫 행이 "5월 식단표" 같은 제목이고 두 번째 행이 실제 컬럼인 경우 대응)
    let bestRow = rows[0];
    let bestCount = bestRow.filter((c) => c != null && String(c).trim() !== '').length;

    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const row = rows[i];
      const count = row.filter((c) => c != null && String(c).trim() !== '').length;
      if (count > bestCount) {
        bestRow = row;
        bestCount = count;
      }
    }

    // 빈 컬럼은 제외
    const headers = bestRow
      .filter((c) => c != null && String(c).trim() !== '')
      .map((c) => String(c).trim());

    if (headers.length === 0) {
      alert('컬럼을 찾을 수 없어요. 첫 행에 컬럼명이 있는 엑셀 파일을 올려주세요.');
      return;
    }

    const analyzedColumns: Column[] = headers.map((h, i) => ({
      index: i,
      header: h,
      type: guessType(h),
      description: '',
    }));

    setColumns(analyzedColumns);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSave = () => {
    setSaved(true);
  };

  const handleDownload = () => {
    // 템플릿 컬럼으로 엑셀 생성해서 다운로드
    const headerRow = columns.map((c) => c.header);
    const ws = XLSX.utils.aoa_to_sheet([headerRow]);
    // 헤더 행 너비 자동 조정
    const wscols = columns.map(() => ({ wch: 15 }));
    ws['!cols'] = wscols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${templateName || '템플릿'}.xlsx`);
  };

  const handleReset = () => {
    setColumns([]);
    setTemplateName('');
    setFileName('');
    setSaved(false);
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">스냅문서</h1>
        <p className="subtitle">찍으면 문서가 됩니다</p>
      </header>

      <main className="main">
        {columns.length === 0 ? (
          /* ── 업로드 영역 ── */
          <section className="section">
            <h2 className="step-title">① 엑셀 파일 올리기</h2>
            <label
              className={`dropzone ${dragOver ? 'dropzone--active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleInputChange}
                className="dropzone__input"
              />
              <div className="dropzone__icon">📁</div>
              <p className="dropzone__text">
                엑셀 파일을 드래그하거나 클릭해서 선택하세요
              </p>
              <p className="dropzone__hint">.xlsx, .xls 파일만 가능</p>
            </label>
          </section>
        ) : saved ? (
          /* ── 저장 완료 ── */
          <>
            <section className="section section--done">
              <div className="done-icon">✅</div>
              <h2>템플릿이 저장되었어요</h2>
              <p className="done-name">{templateName}</p>
              <p className="done-desc">
                이제 앱에서 이 템플릿을 선택할 수 있어요.
              </p>
            </section>
            <section className="section">
              <h2 className="step-title">📋 등록된 컬럼</h2>
              <div className="column-list">
                {columns.map((col) => (
                  <div key={col.index} className="column-item">
                    <span className="column-item__type">{typeLabel(col.type)}</span>
                    <span className="column-item__name">{col.header}</span>
                  </div>
                ))}
              </div>
            </section>
            <button className="btn btn--primary" onClick={handleDownload}>
              📥 템플릿 엑셀 다운로드
            </button>
            <button className="btn btn--outline" onClick={handleReset}>
              다른 템플릿 등록하기
            </button>
          </>
        ) : (
          /* ── 컬럼 분석 결과 ── */
          <>
            <section className="section">
              <h2 className="step-title">
                ② AI가 컬럼을 분석했어요
                <span className="file-badge">{fileName}</span>
              </h2>
              <div className="column-list">
                {columns.map((col) => (
                  <div key={col.index} className="column-item">
                    <span className="column-item__type">
                      {typeLabel(col.type)}
                    </span>
                    <span className="column-item__name">{col.header}</span>
                  </div>
                ))}
              </div>
              <p className="hint">
                컬럼명이 잘못 분석되었다면 PC에서 직접 수정할 수 있어요 (추후 기능)
              </p>
            </section>

            <section className="section">
              <h2 className="step-title">③ 템플릿 이름</h2>
              <input
                type="text"
                className="input"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="예: 건강체크리스트"
              />
            </section>

            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={!templateName.trim()}
            >
              템플릿 저장하기
            </button>
          </>
        )}
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

function cleanTemplateName(filename: string): string {
  // 확장자 제거
  let name = filename.replace(/\.(xlsx|xls)$/i, '');
  // 타임스탬프+언더스코어 패턴 제거 (예: "1780470644228_______" → "")
  name = name.replace(/^\d+_+/, '');
  // 남은 앞부분 언더스코어 제거
  name = name.replace(/^_+/, '');
  // 언더스코어는 공백으로
  name = name.replace(/_+/g, ' ').trim();
  // 숫자+특수문자만 남았으면 의미 없는 이름 → 공백 (사용자가 직접 입력하게)
  if (/^[\d.\s]+$/.test(name) || name === '') {
    return '';
  }
  return name;
}

function guessType(header: string): string {
  const h = header.toLowerCase();
  if (/날짜|일자|일시|date|생년월일/.test(h)) return 'date';
  if (/금액|가격|단가|합계|비용|amount|price/.test(h)) return 'number';
  if (/체온|혈압|키|몸무게|온도|개수|수량/.test(h)) return 'number';
  if (/연락처|전화|phone|tel/.test(h)) return 'text';
  return 'text';
}

function typeLabel(type: string): string {
  switch (type) {
    case 'date': return '📅';
    case 'number': return '🔢';
    default: return '📝';
  }
}

export default App;
