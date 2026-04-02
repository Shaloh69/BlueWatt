import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import '../../config/constants.dart';
import '../../providers/auth_provider.dart';
import '../../providers/home_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar + name
          Center(
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: kPrimaryBlue.withOpacity(0.2),
                    shape: BoxShape.circle,
                    border: Border.all(color: kPrimaryBlue, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      _initials(user?.fullName ?? user?.email ?? 'U'),
                      style: const TextStyle(
                        color: kPrimaryBlue,
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
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
                Text(
                  user?.email ?? '',
                  style:
                      const TextStyle(color: kTextMuted, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: kPrimaryBlue.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    user?.role ?? 'tenant',
                    style: const TextStyle(
                        color: kPrimaryBlue, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Pad info
          Consumer<HomeProvider>(
            builder: (context, home, _) {
              final pad = home.pad;
              if (pad == null) return const SizedBox.shrink();
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
                    const Text(
                      'My Unit',
                      style: TextStyle(
                          color: kTextMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      pad.name,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600),
                    ),
                    if (pad.description != null) ...[
                      const SizedBox(height: 4),
                      Text(pad.description!,
                          style: const TextStyle(
                              color: kTextMuted, fontSize: 13)),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.bolt,
                            color: kWarning, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          '₱${pad.ratePerKwh.toStringAsFixed(2)} / kWh',
                          style: const TextStyle(
                              color: kWarning, fontSize: 13),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 12),

          // Settings / actions
          _ActionTile(
            icon: Icons.notifications_outlined,
            label: 'Notifications',
            onTap: () {
              toastification.show(
                context: context,
                type: ToastificationType.info,
                style: ToastificationStyle.flat,
                title: const Text('Notifications'),
                description: const Text(
                    'Manage notifications in your device settings.'),
                autoCloseDuration: const Duration(seconds: 3),
              );
            },
          ),
          const SizedBox(height: 8),

          _ActionTile(
            icon: Icons.logout,
            label: 'Sign Out',
            danger: true,
            onTap: () => _confirmLogout(context),
          ),
          const SizedBox(height: 32),

          Center(
            child: Text(
              'BlueWatt v1.0.0',
              style: const TextStyle(color: kTextMuted, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCardBg,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12)),
        title: const Text('Sign Out',
            style: TextStyle(color: Colors.white)),
        content: const Text(
            'Are you sure you want to sign out?',
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
            child: const Text('Sign Out',
                style: TextStyle(color: kDanger)),
          ),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : 'U';
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = danger ? kDanger : Colors.white;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: kCardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: danger ? kDanger.withOpacity(0.3) : kBorderColor),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Expanded(
                child: Text(label,
                    style: TextStyle(
                        color: color,
                        fontSize: 14,
                        fontWeight: FontWeight.w500))),
            Icon(Icons.chevron_right,
                color: danger ? kDanger.withOpacity(0.6) : kTextMuted,
                size: 18),
          ],
        ),
      ),
    );
  }
}
