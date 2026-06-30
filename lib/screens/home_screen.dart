import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../providers/app_state.dart';
import '../widgets/template_selector.dart';
import 'camera_screen.dart';
import 'crop_confirm_screen.dart';
import 'text_input_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              const SizedBox(height: 32),
              // 앱 타이틀
              _buildTitle(),
              const SizedBox(height: 40),
              // 입력 선택 카드 3개
              _buildInputSelector(context),
              const SizedBox(height: 28),
              // 템플릿 선택 영역
              _buildTemplateArea(context),
              const Spacer(),
              // 분석하기 버튼
              _buildAnalyzeButton(context),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTitle() {
    return const Column(
      children: [
        Text(
          '스냅문서',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
            color: Color(0xFF111827),
          ),
        ),
        SizedBox(height: 6),
        Text(
          '찍으면 문서가 됩니다',
          style: TextStyle(
            fontSize: 15,
            color: Color(0xFF6B7280),
          ),
        ),
      ],
    );
  }

  Widget _buildInputSelector(BuildContext context) {
    final state = context.watch<AppState>();

    return Row(
      children: [
        _InputCard(
          icon: Icons.camera_alt_rounded,
          label: '촬영',
          isSelected: state.inputType == InputType.camera,
          onTap: () => state.selectInputType(InputType.camera),
        ),
        const SizedBox(width: 12),
        _InputCard(
          icon: Icons.photo_library_rounded,
          label: '갤러리',
          isSelected: state.inputType == InputType.gallery,
          onTap: () => state.selectInputType(InputType.gallery),
        ),
        const SizedBox(width: 12),
        _InputCard(
          icon: Icons.text_fields_rounded,
          label: '텍스트',
          isSelected: state.inputType == InputType.text,
          onTap: () => state.selectInputType(InputType.text),
        ),
      ],
    );
  }

  Widget _buildTemplateArea(BuildContext context) {
    final state = context.watch<AppState>();

    return GestureDetector(
      onTap: () => _showTemplateSelector(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: state.selectedTemplate != null
                ? const Color(0xFF2563EB)
                : const Color(0xFFE5E7EB),
            width: state.selectedTemplate != null ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.description_outlined,
              size: 20,
              color: state.selectedTemplate != null
                  ? const Color(0xFF2563EB)
                  : const Color(0xFF9CA3AF),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                state.selectedTemplate != null
                    ? '${state.selectedTemplate!.name} (${state.selectedTemplate!.columnCount}개 컬럼)'
                    : '템플릿 선택하기',
                style: TextStyle(
                  fontSize: 15,
                  color: state.selectedTemplate != null
                      ? const Color(0xFF111827)
                      : const Color(0xFF9CA3AF),
                  fontWeight: state.selectedTemplate != null
                      ? FontWeight.w500
                      : FontWeight.normal,
                ),
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              color: state.selectedTemplate != null
                  ? const Color(0xFF2563EB)
                  : const Color(0xFF9CA3AF),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalyzeButton(BuildContext context) {
    final state = context.watch<AppState>();

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: state.canAnalyze
            ? () => _startAnalysis(context, state)
            : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF2563EB),
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFE5E7EB),
          disabledForegroundColor: const Color(0xFF9CA3AF),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
        ),
        child: const Text(
          '분석하기',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  void _showTemplateSelector(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => const TemplateSelector(),
    );
  }

  void _startAnalysis(BuildContext context, AppState state) {
    switch (state.inputType) {
      case InputType.camera:
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const CameraScreen()),
        );
        break;
      case InputType.gallery:
        _pickFromGallery(context);
        break;
      case InputType.text:
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const TextInputScreen()),
        );
        break;
      default:
        break;
    }
  }

  Future<void> _pickFromGallery(BuildContext context) async {
    final picker = ImagePicker();
    final XFile? image = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
    );
    if (image != null && context.mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CropConfirmScreen(imagePath: image.path),
        ),
      );
    }
  }
}

// ─── 입력 선택 카드 위젯 ───

class _InputCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _InputCard({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 24),
          decoration: BoxDecoration(
            color:
                isSelected ? const Color(0xFFEFF6FF) : const Color(0xFFF9FAFB),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? const Color(0xFF2563EB)
                  : const Color(0xFFE5E7EB),
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 32,
                color:
                    isSelected ? const Color(0xFF2563EB) : const Color(0xFF6B7280),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected
                      ? const Color(0xFF2563EB)
                      : const Color(0xFF6B7280),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
