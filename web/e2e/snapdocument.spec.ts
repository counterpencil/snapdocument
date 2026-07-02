import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

function createTestXlsx(rows: string[][], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0]?.map(() => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(`e2e/${filename}`, buf);
}

test.describe('스냅문서 E2E', () => {
  test.beforeAll(() => {
    createTestXlsx([
      ['이름', '생년월일', '연락처', '주소', '특이사항'],
    ], 'template_test.xlsx');

    createTestXlsx([
      ['성명', '생년월일', '전화번호', '거주지', '비고'],
      ['홍길동', '1960-05-20', '010-1234-5678', '서울시 강남구', '당뇨'],
    ], 'data_test.xlsx');
  });

  test('페이지 로드: 테스트 사이트 배지 확인', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.logo')).toHaveText('스냅문서');
    await expect(page.locator('.beta-badge')).toHaveText('테스트 사이트');
    await expect(page.locator('.footer__test')).toHaveText(/테스트 사이트/);
  });

  test('템플릿: 엑셀 업로드 → 컬럼 분석 → 등록 버튼 표시', async ({ page }) => {
    await page.goto('/');

    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.first().setInputFiles('e2e/template_test.xlsx');

    await expect(page.locator('.column-item').filter({ hasText: '이름' })).toBeVisible();
    await expect(page.locator('.column-item').filter({ hasText: '생년월일' })).toBeVisible();

    // 등록/취소 버튼 확인
    await expect(page.getByRole('button', { name: '이 양식 등록하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '취소' })).toBeVisible();
  });

  test('정보문서: 파일 업로드 → 텍스트 추출 → 미리보기', async ({ page }) => {
    await page.goto('/');

    // 정보 문서 영역 파일 업로드
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.last().setInputFiles('e2e/data_test.xlsx');

    // 미리보기 확인
    await expect(page.locator('.step-title').filter({ hasText: '업로드 문서 미리보기' })).toBeVisible();
    
    // 텍스트 영역에 추출된 데이터 확인
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue(/홍길동/);
  });

  test('정보문서: 텍스트 직접 입력', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('textarea');
    await textarea.fill('이름: 테스트\n생년월일: 2000-01-01\n연락처: 010-0000-0000');

    await expect(textarea).toHaveValue(/테스트/);
    
    // 변환 버튼 활성화 확인 (템플릿이 선택되지 않으면 비활성화)
    const btn = page.getByRole('button', { name: '변환 실행' });
    await expect(btn).toBeDisabled();
  });
});
