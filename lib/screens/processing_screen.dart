import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import '../providers/app_state.dart';
import 'preview_screen.dart';

class ProcessingScreen extends StatefulWidget {
  const ProcessingScreen({super.key});

  @override
  State<ProcessingScreen> createState() => _ProcessingScreenState();
}

class _ProcessingScreenState extends State<ProcessingScreen> {
  String _status = '문서 분석 중...';

  @override
  void initState() {
    super.initState();
    _runAnalysis();
  }

  Future<void> _runAnalysis() async {
    final state = context.read<AppState>();
    final text = state.textInput ?? '';
    final template = state.selectedTemplate;

    if (template == null || text.isEmpty) {
      _showError('입력 데이터가 없습니다');
      return;
    }

    try {
      final response = await http.post(
        Uri.parse('http://localhost:8787/api/analyze'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'text': text,
          'templateId': template.id,
        }),
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final result = data['result'] as Map<String, dynamic>;
        final mappedData =
            Map<String, String>.from(result['mappedData'] as Map);
        final pcUrl = data['pcUrl'] as String?;
        final templateName = result['templateName'] as String? ?? '';

        state.finishProcessing();

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => PreviewScreen(
              mappedData: mappedData,
              pcUrl: pcUrl,
              templateName: templateName,
            ),
          ),
        );
      } else {
        _showError('분석 실패 (${response.statusCode})');
      }
    } catch (e) {
      if (!mounted) return;
      // API 연결 안 될 때는 더미 데이터로 폴백
      _useDummyFallback();
    }
  }

  void _useDummyFallback() {
    // API 연결 실패 시 더미 매핑으로 테스트 가능하게
    final state = context.read<AppState>();
    state.finishProcessing();

    final dummyData = {
      '날짜': '2026-06-30',
      '성명': '홍길동',
      '체온': '36.5',
      '수축기혈압': '120',
      '이완기혈압': '80',
      '비고': '특이사항 없음',
    };

    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => PreviewScreen(
          mappedData: dummyData,
          pcUrl: null,
          templateName: state.selectedTemplate?.name ?? '',
        ),
      ),
    );
  }

  void _showError(String message) {
    setState(() => _status = message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 56,
              height: 56,
              child: CircularProgressIndicator(
                color: Color(0xFF2563EB),
                strokeWidth: 3,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              _status,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '잠시만 기다려 주세요',
              style: TextStyle(
                fontSize: 14,
                color: Color(0xFF9CA3AF),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
