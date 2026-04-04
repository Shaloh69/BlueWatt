import 'package:flutter/material.dart';

// ── API ───────────────────────────────────────────────────────────────────────
const String kApiBase = 'https://bluewatt-api.onrender.com/api/v1';
// Change to http://192.168.x.x:3000/api/v1 for local dev

// ── Secure storage keys ───────────────────────────────────────────────────────
const String kTokenKey   = 'bw_token';
const String kUserKey    = 'bw_user';

// ── Color palette (Navy + Sky Blue — mirrors web_admin hero.ts) ───────────────
const Color kPrimaryBlue   = Color(0xFF0EA5E9); // sky-500
const Color kPrimaryDark   = Color(0xFF0284C7); // sky-600
const Color kNavy950       = Color(0xFF020C1B); // background
const Color kNavy800       = Color(0xFF0D1B2E); // content1
const Color kNavy700       = Color(0xFF112240); // content2
const Color kNavy600       = Color(0xFF162D4A); // content3 / card
const Color kNavy500       = Color(0xFF1E3A5F); // border
const Color kBgDark        = Color(0xFF020C1B);
const Color kCardBg        = Color(0xFF0D1B2E);
const Color kBorderColor   = Color(0xFF1E3A5F);
const Color kTextMuted     = Color(0xFF8892B0);
const Color kTextBody      = Color(0xFFCCD6F6);
const Color kSuccess       = Color(0xFF17C964);
const Color kWarning       = Color(0xFFF5A524);
const Color kDanger        = Color(0xFFF31260);
const Color kSkyAccent     = Color(0xFF38BDF8); // sky-300
const Color kGradientStart = Color(0xFF0EA5E9);
const Color kGradientEnd   = Color(0xFF1D4ED8);

// ── Notification channel ──────────────────────────────────────────────────────
const String kNotifChannelId   = 'bluewatt_alerts';
const String kNotifChannelName = 'BlueWatt Alerts';
