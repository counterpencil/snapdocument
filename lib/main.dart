import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const SnapDocumentApp());
}

class SnapDocumentApp extends StatelessWidget {
  const SnapDocumentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '스냅문서',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2563EB),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
        fontFamily: 'NotoSansKR',
        scaffoldBackgroundColor: Colors.white,
      ),
      home: const HomeScreen(),
    );
  }
}
