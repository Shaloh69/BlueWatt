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

        final buffer = StringBuffer();
        String pendingType = '';
        String pendingData = '';

        await for (final chunk
            in response.stream.transform(utf8.decoder)) {
          buffer.write(chunk);
          final content = buffer.toString();
          final lines = content.split('\n');
          buffer.clear();
          buffer.write(lines.last);

          for (final line in lines.sublist(0, lines.length - 1)) {
            if (line.startsWith('event:')) {
              pendingType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              pendingData = line.substring(5).trim();
            } else if (line.trim().isEmpty &&
                pendingType.isNotEmpty &&
                pendingData.isNotEmpty) {
              try {
                final parsed =
                    jsonDecode(pendingData) as Map<String, dynamic>;
                _controller.add(SseEvent(pendingType, parsed));
              } catch (_) {}
              pendingType = '';
              pendingData = '';
            }
          }
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
