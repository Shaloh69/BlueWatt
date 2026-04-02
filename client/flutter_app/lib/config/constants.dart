import 'package:flutter/material.dart';

// ── API ───────────────────────────────────────────────────────────────────────
const String kApiBase = 'https://bluewatt-api.onrender.com/api/v1';
// Change to http://192.168.x.x:3000/api/v1 for local dev

// ── Secure storage keys ───────────────────────────────────────────────────────
const String kTokenKey   = 'bw_token';
const String kUserKey    = 'bw_user';

// ── Color palette (mirrors web_admin HeroUI theme) ───────────────────────────
const Color kPrimaryBlue  = Color(0xFF006FEE);
const Color kBgDark       = Color(0xFF0F172A);
const Color kCardBg       = Color(0xFF1E293B);
const Color kBorderColor  = Color(0xFF334155);
const Color kTextMuted    = Color(0xFF64748B);
const Color kTextBody     = Color(0xFFE2E8F0);
const Color kSuccess      = Color(0xFF4ADE80);
const Color kWarning      = Color(0xFFFBBF24);
const Color kDanger       = Color(0xFFF87171);
const Color kPurple       = Color(0xFF818CF8);
const Color kGradientStart = Color(0xFF667EEA);
const Color kGradientEnd   = Color(0xFF764BA2);

// ── Notification channel ──────────────────────────────────────────────────────
const String kNotifChannelId   = 'bluewatt_alerts';
const String kNotifChannelName = 'BlueWatt Alerts';
