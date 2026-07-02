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
    // 템플릿용 엑셀 생성
    createTestXlsx([
      ['이름', '생년월일', '연락처', '주소', '특이사항'],
    ], 'template_test.xlsx');

    // 정보문서용 엑셀 생성 (데이터 포함)
    createTestXlsx([
      ['성명', '생년월일', '전화번호', '거주지', '비고'],
      ['홍길동', '1960-05-20', '010-1234-5678', '서울시 강남구', '당뇨'],
    ], 'data_test.xlsx');
  });

  test('템플릿 등록: 엑셀 업로드 → 컬럼 분석 → 미리보기', async ({ page }) => {
    await page.goto('/');

    // 타이틀 확인
    await expect(page.locator('.logo')).toHaveText('스냅문서');
    await expect(page.locator('.beta-badge')).toHaveText('테스트 사이트');

    // 템플릿 등록 탭이 활성화되어 있는지 확인
    const templateTab = page.locator('.tab').first();
    await expect(templateTab).toHaveClass(/tab--active/);

    // 파일 업로드
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles('e2e/template_test.xlsx');

    // 컬럼 분석 결과 확인
    await expect(page.locator('.step-title').filter({ hasText: '컬럼을 분석했어요' })).toBeVisible();
    
    // 5개 컬럼이 모두 표시되는지 확인 (column-item__name 내부)
    await expect(page.locator('.column-item__name').filter({ hasText: '이름' })).toBeVisible();
    await expect(page.locator('.column-item__name').filter({ hasText: '생년월일' })).toBeVisible();
    await expect(page.locator('.column-item__name').filter({ hasText: '연락처' })).toBeVisible();
    await expect(page.locator('.column-item__name').filter({ hasText: '주소' })).toBeVisible();
    await expect(page.locator('.column-item__name').filter({ hasText: '특이사항' })).toBeVisible();

    // 스프레드시트 미리보기 확인
    await expect(page.locator('.step-title').filter({ hasText: '문서 미리보기' })).toBeVisible();

    // 템플릿 이름 입력 및 저장
    const nameInput = page.getByPlaceholder('예: 건강체크리스트');
    await nameInput.fill('연락처카드');
    await page.getByRole('button', { name: '템플릿 저장하기' }).click();

    // 저장 완료 확인
    await expect(page.getByText('템플릿이 저장되었어요')).toBeVisible();
    await expect(page.getByText('연락처카드')).toBeVisible();
  });

  test('문서 변환: 탭 전환 → 텍스트 입력', async ({ page }) => {
    await page.goto('/');

    // 문서 변환 탭으로 전환
    await page.getByRole('button', { name: '문서 변환' }).click();

    // 템플릿 선택 영역 확인
    await expect(page.locator('.step-title').filter({ hasText: '템플릿 선택' })).toBeVisible();
    
    // 정보 문서 업로드 영역 확인
    await expect(page.locator('.step-title').filter({ hasText: '정보 문서 업로드' })).toBeVisible();

    // 텍스트 입력
    const textarea = page.locator('textarea');
    await textarea.fill('이름: 홍길동\n생년월일: 1960-05-20\n연락처: 010-1234-5678\n주소: 서울시 강남구\n특이사항: 테스트');

    // 텍스트가 입력되었는지 확인
    await expect(textarea).toHaveValue(/홍길동/);
  });

  test('문서 변환: 파일 업로드 → 미리보기', async ({ page }) => {
    await page.goto('/');

    // 문서 변환 탭으로 전환
    await page.getByRole('button', { name: '문서 변환' }).click();

    // 정보문서 파일 업로드 (두 번째 file input)
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.last().setInputFiles('e2e/data_test.xlsx');

    // 업로드 문서 미리보기 확인
    await expect(page.locator('.step-title').filter({ hasText: '업로드 문서 미리보기' })).toBeVisible();
    
    // 텍스트 영역에 추출된 데이터가 들어갔는지 확인
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue(/홍길동/);
  });

  test('하단: 테스트 사이트 안내 표시', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.footer__test')).toHaveText(/테스트 사이트/);
    // 앱스토어 링크가 없는지 확인
    await expect(page.getByText('App Store')).toHaveCount(0);
  });
});
