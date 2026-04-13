import 'package:flutter/material.dart';
import 'package:toastification/toastification.dart';
import '../../config/constants.dart';
import '../../services/api_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  int _step = 1; // 1 = enter email, 2 = enter OTP + new password

  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _newPwCtrl = TextEditingController();
  final _confirmPwCtrl = TextEditingController();

  bool _loading = false;
  bool _showNew = false;
  bool _showConfirm = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    super.dispose();
  }

  void _toast(String msg, {bool error = false}) {
    toastification.show(
      context: context,
      type: error ? ToastificationType.error : ToastificationType.success,
      style: ToastificationStyle.flat,
      title: Text(error ? 'Error' : 'Done'),
      description: Text(msg),
      autoCloseDuration: const Duration(seconds: 4),
    );
  }

  Future<void> _sendOtp() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      _toast('Enter your email address', error: true);
      return;
    }
    setState(() => _loading = true);
    try {
      await ApiService.forgotPassword(email);
      if (mounted) setState(() => _step = 2);
      _toast('OTP sent — check your email');
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPassword() async {
    final otp = _otpCtrl.text.trim();
    final newPw = _newPwCtrl.text;
    final confirm = _confirmPwCtrl.text;
    if (otp.isEmpty || newPw.isEmpty || confirm.isEmpty) {
      _toast('All fields are required', error: true);
      return;
    }
    if (newPw != confirm) {
      _toast('Passwords do not match', error: true);
      return;
    }
    if (newPw.length < 8) {
      _toast('Password must be at least 8 characters', error: true);
      return;
    }
    setState(() => _loading = true);
    try {
      await ApiService.resetPassword(
        email: _emailCtrl.text.trim(),
        otp: otp,
        newPassword: newPw,
      );
      if (mounted) {
        _toast('Password reset successfully');
        Navigator.pop(context);
      }
    } catch (e) {
      _toast(e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reset Password'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // Icon
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: kPrimaryBlue.withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.lock_reset, color: kPrimaryBlue, size: 32),
                ),
                const SizedBox(height: 20),

                // Step indicator
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _StepDot(active: _step >= 1, label: '1'),
                    Container(width: 32, height: 2,
                        color: _step >= 2 ? kPrimaryBlue : kBorderColor),
                    _StepDot(active: _step >= 2, label: '2'),
                  ],
                ),
                const SizedBox(height: 24),

                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: kCardBg,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: kBorderColor),
                  ),
                  child: _step == 1 ? _buildStep1() : _buildStep2(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Forgot Password',
            style: TextStyle(color: Colors.white, fontSize: 18,
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        const Text('Enter your email and we\'ll send you a reset code.',
            style: TextStyle(color: kTextMuted, fontSize: 13)),
        const SizedBox(height: 20),
        TextField(
          controller: _emailCtrl,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'Email',
            prefixIcon: Icon(Icons.email_outlined),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: _loading ? null : _sendOtp,
            child: _loading
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Send Reset Code'),
          ),
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Enter Reset Code',
            style: TextStyle(color: Colors.white, fontSize: 18,
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text('Code sent to ${_emailCtrl.text.trim()}',
            style: const TextStyle(color: kTextMuted, fontSize: 13)),
        const SizedBox(height: 20),
        TextField(
          controller: _otpCtrl,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Colors.white, fontSize: 22,
              letterSpacing: 6),
          textAlign: TextAlign.center,
          maxLength: 6,
          decoration: const InputDecoration(
            labelText: 'Reset Code',
            prefixIcon: Icon(Icons.pin),
            counterText: '',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _newPwCtrl,
          obscureText: !_showNew,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'New Password',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility,
                  size: 18, color: kTextMuted),
              onPressed: () => setState(() => _showNew = !_showNew),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _confirmPwCtrl,
          obscureText: !_showConfirm,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'Confirm New Password',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_showConfirm ? Icons.visibility_off : Icons.visibility,
                  size: 18, color: kTextMuted),
              onPressed: () => setState(() => _showConfirm = !_showConfirm),
            ),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 48,
          child: ElevatedButton(
            onPressed: _loading ? null : _resetPassword,
            child: _loading
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Reset Password'),
          ),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _loading ? null : () => setState(() {
            _step = 1;
            _otpCtrl.clear();
            _newPwCtrl.clear();
            _confirmPwCtrl.clear();
          }),
          child: const Text('Resend Code', style: TextStyle(color: kTextMuted)),
        ),
      ],
    );
  }
}

class _StepDot extends StatelessWidget {
  final bool active;
  final String label;
  const _StepDot({required this.active, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28, height: 28,
      decoration: BoxDecoration(
        color: active ? kPrimaryBlue : kCardBg,
        shape: BoxShape.circle,
        border: Border.all(color: active ? kPrimaryBlue : kBorderColor, width: 2),
      ),
      child: Center(
        child: Text(label,
            style: TextStyle(
              color: active ? Colors.white : kTextMuted,
              fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
