import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import 'dart:io';
import '../../config/constants.dart';
import '../../providers/auth_provider.dart';
import '../../providers/home_provider.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  // Edit name/email
  bool _editingProfile = false;
  late TextEditingController _nameCtrl;
  late TextEditingController _emailCtrl;
  bool _savingProfile = false;

  // Change password
  bool _changingPassword = false;
  final _currentPwCtrl = TextEditingController();
  final _newPwCtrl = TextEditingController();
  final _confirmPwCtrl = TextEditingController();
  bool _savingPassword = false;
  bool _showCurrentPw = false;
  bool _showNewPw = false;
  bool _showConfirmPw = false;

  // Avatar
  bool _uploadingAvatar = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    _nameCtrl = TextEditingController(text: user?.fullName ?? '');
    _emailCtrl = TextEditingController(text: user?.email ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _currentPwCtrl.dispose();
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    super.dispose();
  }

  void _showToast(String message, {bool error = false}) {
    toastification.show(
      context: context,
      type: error ? ToastificationType.error : ToastificationType.success,
      style: ToastificationStyle.flat,
      title: Text(error ? 'Error' : 'Success'),
      description: Text(message),
      autoCloseDuration: const Duration(seconds: 4),
    );
  }

  Future<void> _saveProfile() async {
    final auth = context.read<AuthProvider>();
    final user = auth.user;
    final newName = _nameCtrl.text.trim();
    final newEmail = _emailCtrl.text.trim();
    if (newName.isEmpty && newEmail.isEmpty) return;
    if (newName == user?.fullName && newEmail == user?.email) {
      setState(() => _editingProfile = false);
      return;
    }
    setState(() => _savingProfile = true);
    try {
      await auth.updateProfile(
        fullName: newName != user?.fullName ? newName : null,
        email: newEmail != user?.email ? newEmail : null,
      );
      setState(() => _editingProfile = false);
      _showToast('Profile updated');
    } catch (e) {
      _showToast(e.toString(), error: true);
    } finally {
      setState(() => _savingProfile = false);
    }
  }

  Future<void> _savePassword() async {
    final current = _currentPwCtrl.text;
    final newPw = _newPwCtrl.text;
    final confirm = _confirmPwCtrl.text;
    if (current.isEmpty || newPw.isEmpty || confirm.isEmpty) {
      _showToast('All password fields are required', error: true);
      return;
    }
    if (newPw != confirm) {
      _showToast('New passwords do not match', error: true);
      return;
    }
    if (newPw.length < 8) {
      _showToast('New password must be at least 8 characters', error: true);
      return;
    }
    setState(() => _savingPassword = true);
    try {
      await context.read<AuthProvider>().changePassword(current, newPw);
      _currentPwCtrl.clear();
      _newPwCtrl.clear();
      _confirmPwCtrl.clear();
      setState(() => _changingPassword = false);
      _showToast('Password changed successfully');
    } catch (e) {
      _showToast(e.toString(), error: true);
    } finally {
      setState(() => _savingPassword = false);
    }
  }

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 800,
      maxHeight: 800,
      imageQuality: 85,
    );
    if (picked == null) return;
    setState(() => _uploadingAvatar = true);
    try {
      await context.read<AuthProvider>().uploadProfileImage(File(picked.path));
      _showToast('Profile picture updated');
    } catch (e) {
      _showToast(e.toString(), error: true);
    } finally {
      setState(() => _uploadingAvatar = false);
    }
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCardBg,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text('Sign Out',
            style: TextStyle(color: Colors.white)),
        content: const Text('Are you sure you want to sign out?',
            style: TextStyle(color: kTextMuted)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<HomeProvider>().disconnectSSE();
              context.read<AuthProvider>().logout();
            },
            child:
                const Text('Sign Out', style: TextStyle(color: kDanger)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Avatar ─────────────────────────────────────────────────────
          Center(
            child: Column(
              children: [
                GestureDetector(
                  onTap: _uploadingAvatar ? null : _pickAndUploadAvatar,
                  child: Stack(
                    alignment: Alignment.bottomRight,
                    children: [
                      Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          color: kPrimaryBlue.withOpacity(0.2),
                          shape: BoxShape.circle,
                          border: Border.all(color: kPrimaryBlue, width: 2),
                        ),
                        child: _uploadingAvatar
                            ? const Center(
                                child: SizedBox(
                                  width: 28,
                                  height: 28,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: kPrimaryBlue),
                                ),
                              )
                            : (user?.profileImageUrl != null
                                ? ClipOval(
                                    child: Image.network(
                                      user!.profileImageUrl!,
                                      width: 88,
                                      height: 88,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          _initialsWidget(user.fullName),
                                    ),
                                  )
                                : _initialsWidget(
                                    user?.fullName ?? user?.email ?? 'U')),
                      ),
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: kPrimaryBlue,
                          shape: BoxShape.circle,
                          border: Border.all(color: kBgDark, width: 2),
                        ),
                        child: const Icon(Icons.camera_alt,
                            size: 13, color: Colors.white),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  user?.fullName ?? 'Tenant',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(user?.email ?? '',
                    style:
                        const TextStyle(color: kTextMuted, fontSize: 13)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: kPrimaryBlue.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(user?.role ?? 'tenant',
                      style: const TextStyle(
                          color: kPrimaryBlue, fontSize: 12)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // ── Pad info ───────────────────────────────────────────────────
          Consumer<HomeProvider>(
            builder: (context, home, _) {
              final pad = home.pad;
              if (pad == null) return const SizedBox.shrink();
              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: kCardBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kBorderColor),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('My Unit',
                        style: TextStyle(
                            color: kTextMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w500)),
                    const SizedBox(height: 8),
                    Text(pad.name,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600)),
                    if (pad.description != null) ...[
                      const SizedBox(height: 4),
                      Text(pad.description!,
                          style: const TextStyle(
                              color: kTextMuted, fontSize: 13)),
                    ],
                    const SizedBox(height: 8),
                    Row(children: [
                      const Icon(Icons.bolt, color: kWarning, size: 14),
                      const SizedBox(width: 4),
                      Text('₱${pad.ratePerKwh.toStringAsFixed(2)} / kWh',
                          style: const TextStyle(
                              color: kWarning, fontSize: 13)),
                    ]),
                  ],
                ),
              );
            },
          ),

          // ── Edit Profile section ───────────────────────────────────────
          _SectionCard(
            title: 'Profile Information',
            trailing: _editingProfile
                ? null
                : TextButton(
                    onPressed: () => setState(() => _editingProfile = true),
                    child: const Text('Edit',
                        style: TextStyle(color: kPrimaryBlue))),
            child: _editingProfile
                ? Column(
                    children: [
                      _buildField(
                          controller: _nameCtrl,
                          label: 'Full Name',
                          icon: Icons.person_outline),
                      const SizedBox(height: 12),
                      _buildField(
                          controller: _emailCtrl,
                          label: 'Email',
                          icon: Icons.mail_outline,
                          keyboardType: TextInputType.emailAddress),
                      const SizedBox(height: 16),
                      Row(children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _savingProfile
                                ? null
                                : () => setState(
                                    () => _editingProfile = false),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: kBorderColor),
                              minimumSize: const Size(0, 44),
                            ),
                            child: const Text('Cancel',
                                style: TextStyle(color: kTextMuted)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed:
                                _savingProfile ? null : _saveProfile,
                            style: ElevatedButton.styleFrom(
                                minimumSize: const Size(0, 44)),
                            child: _savingProfile
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white))
                                : const Text('Save'),
                          ),
                        ),
                      ]),
                    ],
                  )
                : Column(
                    children: [
                      _InfoRow(label: 'Name', value: user?.fullName ?? '—'),
                      const SizedBox(height: 8),
                      _InfoRow(label: 'Email', value: user?.email ?? '—'),
                    ],
                  ),
          ),
          const SizedBox(height: 12),

          // ── Change Password section ────────────────────────────────────
          _SectionCard(
            title: 'Change Password',
            trailing: _changingPassword
                ? null
                : TextButton(
                    onPressed: () =>
                        setState(() => _changingPassword = true),
                    child: const Text('Change',
                        style: TextStyle(color: kPrimaryBlue))),
            child: _changingPassword
                ? Column(
                    children: [
                      _buildPasswordField(
                          controller: _currentPwCtrl,
                          label: 'Current Password',
                          show: _showCurrentPw,
                          onToggle: () => setState(
                              () => _showCurrentPw = !_showCurrentPw)),
                      const SizedBox(height: 12),
                      _buildPasswordField(
                          controller: _newPwCtrl,
                          label: 'New Password',
                          show: _showNewPw,
                          onToggle: () =>
                              setState(() => _showNewPw = !_showNewPw)),
                      const SizedBox(height: 12),
                      _buildPasswordField(
                          controller: _confirmPwCtrl,
                          label: 'Confirm New Password',
                          show: _showConfirmPw,
                          onToggle: () => setState(
                              () => _showConfirmPw = !_showConfirmPw)),
                      const SizedBox(height: 16),
                      Row(children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _savingPassword
                                ? null
                                : () {
                                    _currentPwCtrl.clear();
                                    _newPwCtrl.clear();
                                    _confirmPwCtrl.clear();
                                    setState(
                                        () => _changingPassword = false);
                                  },
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: kBorderColor),
                              minimumSize: const Size(0, 44),
                            ),
                            child: const Text('Cancel',
                                style: TextStyle(color: kTextMuted)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed:
                                _savingPassword ? null : _savePassword,
                            style: ElevatedButton.styleFrom(
                                minimumSize: const Size(0, 44)),
                            child: _savingPassword
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white))
                                : const Text('Update'),
                          ),
                        ),
                      ]),
                    ],
                  )
                : const Text(
                    'Keep your account secure with a strong password.',
                    style: TextStyle(color: kTextMuted, fontSize: 13),
                  ),
          ),
          const SizedBox(height: 12),

          // ── Sign Out ───────────────────────────────────────────────────
          GestureDetector(
            onTap: () => _confirmLogout(context),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: kCardBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: kDanger.withOpacity(0.3)),
              ),
              child: Row(children: [
                const Icon(Icons.logout, color: kDanger, size: 20),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text('Sign Out',
                      style: TextStyle(
                          color: kDanger,
                          fontSize: 14,
                          fontWeight: FontWeight.w500)),
                ),
                Icon(Icons.chevron_right,
                    color: kDanger.withOpacity(0.6), size: 18),
              ]),
            ),
          ),
          const SizedBox(height: 32),

          const Center(
            child: Text('BlueWatt v1.0.0',
                style: TextStyle(color: kTextMuted, fontSize: 12)),
          ),
        ],
      ),
    );
  }

  Widget _initialsWidget(String name) {
    final parts = name.trim().split(' ');
    final initials = parts.length >= 2
        ? '${parts[0][0]}${parts[1][0]}'.toUpperCase()
        : name.isNotEmpty
            ? name[0].toUpperCase()
            : 'U';
    return Center(
      child: Text(initials,
          style: const TextStyle(
              color: kPrimaryBlue,
              fontSize: 28,
              fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 18, color: kTextMuted),
      ),
    );
  }

  Widget _buildPasswordField({
    required TextEditingController controller,
    required String label,
    required bool show,
    required VoidCallback onToggle,
  }) {
    return TextField(
      controller: controller,
      obscureText: !show,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon:
            const Icon(Icons.lock_outline, size: 18, color: kTextMuted),
        suffixIcon: IconButton(
          icon: Icon(show ? Icons.visibility_off : Icons.visibility,
              size: 18, color: kTextMuted),
          onPressed: onToggle,
        ),
      ),
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? trailing;

  const _SectionCard(
      {required this.title, required this.child, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kBorderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(title,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600)),
            ),
            if (trailing != null) trailing!,
          ]),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 60,
          child: Text(label,
              style: const TextStyle(color: kTextMuted, fontSize: 13)),
        ),
        Expanded(
          child: Text(value,
              style: const TextStyle(color: Colors.white, fontSize: 13)),
        ),
      ],
    );
  }
}
