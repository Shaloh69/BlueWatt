import 'package:flutter/material.dart';
import '../config/constants.dart';

class RelayStatusBadge extends StatelessWidget {
  final String? status;

  const RelayStatusBadge({super.key, this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    IconData icon;

    switch (status) {
      case 'on':
        color = kSuccess;
        label = 'Power On';
        icon = Icons.power;
        break;
      case 'off':
        color = kTextMuted;
        label = 'Power Off';
        icon = Icons.power_off;
        break;
      case 'tripped':
        color = kDanger;
        label = 'Tripped';
        icon = Icons.warning_amber_rounded;
        break;
      default:
        color = kTextMuted;
        label = 'Unknown';
        icon = Icons.help_outline;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
                color: color, fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
