import 'package:flutter_test/flutter_test.dart';
import 'package:snapdocument/main.dart';

void main() {
  testWidgets('앱이 정상적으로 시작된다', (WidgetTester tester) async {
    await tester.pumpWidget(const SnapDocumentApp());
    expect(find.text('스냅문서'), findsOneWidget);
  });
}
