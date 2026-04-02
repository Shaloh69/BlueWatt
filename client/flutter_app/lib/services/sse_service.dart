import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/constants.dart';

class SseEvent {
  final String type;
  final Map<String, dynamic> data;
  SseEvent(this.type, this.data);
}

class SseService {
  final _controller = StreamController<SseEvent>.broadcast();
  http.Client? _client;
  bool _running = false;
  String? _token;

  Stream<SseEvent> get stream => _controller.stream;

  void connect(String token) {
    _token = token;
    if (_running) return;
    _running = true;
    _connect();
  }

  void disconnect() {
    _running = false;
    _client?.close();
    _client = null;
  }

  Future<void> _connect() async {
    while (_running) {
      _client = http.Client();
      try {
        final uri = Uri.parse(
            '$kApiBase/sse/events?token=${Uri.encodeComponent(_token ?? '')}');
        final request = http.Request('GET', uri);
        final response = await _client!.send(request);

        String eventType = '';
        final buffer = StringBuffer();

        await for (final chunk
            in response.stream.transform(utf8.decoder)) {
          buffer.write(chunk);
          final content = buffer.toString();
          // Process complete lines
          final lines = content.split('\n');
          // Keep last incomplete line in buffer
          buffer.clear();
          buffer.write(lines.last);

          String currentType = '';
          String currentData = '';

          for (final line in lines.sublist(0, lines.length - 1)) {
            if (line.startsWith('event:')) {
              currentType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              currentData = line.substring(5).trim();
            } else if (line.trim().isEmpty &&
                currentType.isNotEmpty &&
                currentData.isNotEmpty) {
              try {
                final parsed =
                    jsonDecode(currentData) as Map<String, dynamic>;
                _controller.add(SseEvent(currentType, parsed));
              } catch (_) {}
              currentType = '';
              currentData = '';
            } else if (line.startsWith(':')) {
              // heartbeat ping — ignore
            }
          }
          eventType = currentType;
        }
      } catch (_) {
        // ignore — will retry
      } finally {
        _client?.close();
        _client = null;
      }

      if (_running) {
        await Future.delayed(const Duration(seconds: 5));
      }
    }
  }

  void dispose() {
    disconnect();
    _controller.close();
  }
}
