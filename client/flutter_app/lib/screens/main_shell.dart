import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/constants.dart';
import '../providers/billing_provider.dart';
import '../providers/home_provider.dart';
import '../providers/auth_provider.dart';
import 'home/home_screen.dart';
import 'bills/bills_screen.dart';
import 'profile/profile_screen.dart';

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: kWarning.withOpacity(0.15),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(Icons.wifi_off_rounded, size: 14, color: kWarning),
          const SizedBox(width: 8),
          const Text(
            'No internet connection — showing last known data',
            style: TextStyle(fontSize: 11, color: kWarning),
          ),
        ],
      ),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _tab = 0;

  static const _screens = [
    HomeScreen(),
    BillsScreen(),
    ProfileScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    final auth = context.read<AuthProvider>();
    final home = context.read<HomeProvider>();
    final billing = context.read<BillingProvider>();

    await home.load();
    await billing.load();

    if (auth.token != null) {
      home.connectSSE(auth.token!);
      billing.listenSSE(home.sseStream);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isOnline = context.select<HomeProvider, bool>((h) => h.isOnline);
    return Scaffold(
      body: Column(
        children: [
          if (!isOnline) const _OfflineBanner(),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: _screens,
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: kCardBg,
        indicatorColor: kPrimaryBlue.withOpacity(0.2),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home, color: kPrimaryBlue),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long, color: kPrimaryBlue),
            label: 'Bills',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person, color: kPrimaryBlue),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
