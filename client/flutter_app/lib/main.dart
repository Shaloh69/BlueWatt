import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/billing_provider.dart';
import 'providers/home_provider.dart';
import 'screens/login/login_screen.dart';
import 'screens/main_shell.dart';
import 'services/notification_service.dart';
import 'services/app_cache.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await NotificationService.init();
  await NotificationService.requestPermission();
  await AppCache.init();
  runApp(const BlueWattApp());
}

class BlueWattApp extends StatelessWidget {
  const BlueWattApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..init()),
        ChangeNotifierProvider(create: (_) => HomeProvider()),
        ChangeNotifierProvider(create: (_) => BillingProvider()),
      ],
      child: ToastificationWrapper(
        child: MaterialApp(
          title: 'BlueWatt',
          debugShowCheckedModeBanner: false,
          theme: appTheme,
          home: const _RootRouter(),
        ),
      ),
    );
  }
}

class _RootRouter extends StatelessWidget {
  const _RootRouter();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    switch (auth.state) {
      case AuthState.unknown:
        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      case AuthState.authenticated:
        return const MainShell();
      case AuthState.unauthenticated:
        return const LoginScreen();
    }
  }
}
