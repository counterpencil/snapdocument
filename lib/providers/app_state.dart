import 'package:flutter/foundation.dart';
import '../models/template.dart';

enum InputType { none, camera, gallery, text }

class AppState extends ChangeNotifier {
  InputType _inputType = InputType.none;
  Template? _selectedTemplate;
  String? _textInput;
  bool _isProcessing = false;

  // 더미 템플릿 목록
  List<Template> get templates => [
        Template(
          id: '1',
          name: '건강체크리스트',
          columnCount: 6,
          columns: [
            TemplateColumn(
                index: 0,
                header: '날짜',
                type: 'date',
                description: '측정 날짜'),
            TemplateColumn(
                index: 1, header: '성명', type: 'text', description: '대상자 이름'),
            TemplateColumn(
                index: 2,
                header: '체온',
                type: 'number',
                description: '체온(℃)'),
            TemplateColumn(
                index: 3,
                header: '수축기혈압',
                type: 'number',
                description: '수축기 혈압'),
            TemplateColumn(
                index: 4,
                header: '이완기혈압',
                type: 'number',
                description: '이완기 혈압'),
            TemplateColumn(
                index: 5,
                header: '비고',
                type: 'text',
                description: '특이사항'),
          ],
        ),
        Template(
          id: '2',
          name: '면회기록부',
          columnCount: 4,
          columns: [
            TemplateColumn(
                index: 0,
                header: '방문일',
                type: 'date',
                description: '방문 날짜'),
            TemplateColumn(
                index: 1,
                header: '방문자',
                type: 'text',
                description: '방문자 성명'),
            TemplateColumn(
                index: 2,
                header: '관계',
                type: 'text',
                description: '입소자와의 관계'),
            TemplateColumn(
                index: 3,
                header: '방문시간',
                type: 'text',
                description: '방문 시작~종료'),
          ],
        ),
        Template(
          id: '3',
          name: '입소상담지',
          columnCount: 8,
          columns: [
            TemplateColumn(
                index: 0,
                header: '신청일',
                type: 'date',
                description: '상담 신청일'),
            TemplateColumn(
                index: 1,
                header: '성명',
                type: 'text',
                description: '입소 희망자 성명'),
            TemplateColumn(
                index: 2,
                header: '생년월일',
                type: 'date',
                description: '생년월일'),
            TemplateColumn(
                index: 3,
                header: '보호자',
                type: 'text',
                description: '보호자 성명'),
            TemplateColumn(
                index: 4,
                header: '연락처',
                type: 'text',
                description: '보호자 연락처'),
            TemplateColumn(
                index: 5,
                header: '주소',
                type: 'text',
                description: '거주지 주소'),
            TemplateColumn(
                index: 6,
                header: '질환',
                type: 'text',
                description: '기저질환'),
            TemplateColumn(
                index: 7,
                header: '비고',
                type: 'text',
                description: '특이사항'),
          ],
        ),
      ];

  InputType get inputType => _inputType;
  Template? get selectedTemplate => _selectedTemplate;
  String? get textInput => _textInput;
  bool get isProcessing => _isProcessing;
  bool get canAnalyze =>
      _selectedTemplate != null &&
      (_inputType != InputType.none || (_textInput?.isNotEmpty ?? false));

  void selectInputType(InputType type) {
    _inputType = type;
    notifyListeners();
  }

  void selectTemplate(Template? template) {
    _selectedTemplate = template;
    notifyListeners();
  }

  void setTextInput(String text) {
    _textInput = text;
    notifyListeners();
  }

  void startProcessing() {
    _isProcessing = true;
    notifyListeners();
  }

  void finishProcessing() {
    _isProcessing = false;
    notifyListeners();
  }

  void reset() {
    _inputType = InputType.none;
    _selectedTemplate = null;
    _textInput = null;
    _isProcessing = false;
    notifyListeners();
  }
}
