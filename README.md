# 스냅문서 (SnapDocument)

> 찍으면 문서가 됩니다 — 오프라인 문서를 촬영하면 AI가 엑셀 양식에 맞춰 자동으로 채워주는 서비스

## 프로젝트 구조

```
snapdocument/
├── app/          # Flutter 모바일 앱 (iOS + Android)
├── web/          # React PC 웹 (템플릿 등록)
├── worker/       # Cloudflare Workers API
└── 기획서.md     # 제품 기획서
```

## 기술 스택

| 구성 | 기술 |
|------|------|
| 모바일 앱 | Flutter (Dart) |
| PC 웹 | React + TypeScript + Vite |
| API 서버 | Cloudflare Workers |
| 스토리지 | Cloudflare R2 (24h TTL) |
| OCR | 네이버 Clova OCR (예정) |
| AI 매핑 | DeepSeek LLM (예정, 현재 모의 매퍼) |

## 로컬 실행

```bash
# Flutter 앱
cd app && flutter run

# React 웹
cd web && npm run dev

# Workers API
cd worker && npx wrangler dev
```

## MVP 기능

- 📷 카메라 촬영 (원근 자동 보정)
- 🖼️ 갤러리에서 이미지 불러오기
- 📝 텍스트 직접 입력
- 📊 엑셀 템플릿 등록 (컬럼 자동 분석)
- 🤖 AI 텍스트 매핑 (템플릿 컬럼에 맞춰 값 추출)
- 👀 미리보기 및 PC 링크 공유

## 라이선스

MIT
