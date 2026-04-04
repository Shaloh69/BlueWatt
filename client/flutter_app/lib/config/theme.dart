import 'package:flutter/material.dart';
import 'constants.dart';

final ThemeData appTheme = _buildAppTheme();

ThemeData _buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: kBgDark,
    colorScheme: const ColorScheme.dark(
      primary: kPrimaryBlue,
      secondary: kNavy600,
      surface: kCardBg,
      error: kDanger,
      onPrimary: Colors.white,
      onSecondary: kTextBody,
      onSurface: kTextBody,
      onError: Colors.white,
    ),
    cardTheme: CardThemeData(
      color: kCardBg,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: kBorderColor, width: 1),
      ),
      margin: EdgeInsets.zero,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: kBgDark,
      foregroundColor: kTextBody,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: kTextBody,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: kCardBg,
      selectedItemColor: kPrimaryBlue,
      unselectedItemColor: kTextMuted,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kCardBg,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: kBorderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: kBorderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: kPrimaryBlue, width: 2),
      ),
      labelStyle: const TextStyle(color: kTextMuted),
      hintStyle: const TextStyle(color: kTextMuted),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimaryBlue,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(double.infinity, 52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kPrimaryBlue,
        side: const BorderSide(color: kPrimaryBlue),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        minimumSize: const Size(double.infinity, 52),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kBorderColor,
      labelStyle: const TextStyle(color: kTextBody, fontSize: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),
    dividerTheme: const DividerThemeData(color: kBorderColor, thickness: 1),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(color: kTextBody, fontWeight: FontWeight.w700),
      titleLarge: TextStyle(color: kTextBody, fontWeight: FontWeight.w600),
      titleMedium: TextStyle(color: kTextBody, fontWeight: FontWeight.w600),
      bodyLarge: TextStyle(color: kTextBody),
      bodyMedium: TextStyle(color: kTextBody),
      bodySmall: TextStyle(color: kTextMuted, fontSize: 12),
      labelSmall: TextStyle(color: kTextMuted, fontSize: 11),
    ),
  );
}
