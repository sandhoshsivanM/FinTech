import 'dart:math';

import 'package:flutter/material.dart';

import '../app_services.dart';
import 'home_screen.dart';

/// First device of a new account: create the data key and show the recovery
/// phrase once. Nothing reaches the server until the user has proved they
/// wrote it down (three words typed back), as on the web.
class RecoveryPhraseScreen extends StatefulWidget {
  const RecoveryPhraseScreen({super.key, required this.services, Random? random}) : _random = random;
  final AppServices services;
  final Random? _random;

  @override
  State<RecoveryPhraseScreen> createState() => _RecoveryPhraseScreenState();
}

class _RecoveryPhraseScreenState extends State<RecoveryPhraseScreen> {
  late final _pending = widget.services.keys.createAccountKey();
  late final List<int> _asked = _pick();
  final _answers = <int, TextEditingController>{};
  bool _confirming = false;
  bool _busy = false;
  String? _error;

  List<int> _pick() {
    final r = widget._random ?? Random.secure();
    final picks = <int>{};
    while (picks.length < 3) {
      picks.add(r.nextInt(24));
    }
    return picks.toList()..sort();
  }

  TextEditingController _controller(int i) => _answers.putIfAbsent(i, () => TextEditingController()..addListener(() => setState(() {})));

  @override
  void dispose() {
    for (final c in _answers.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _correct => _asked.every((i) => _controller(i).text.trim().toLowerCase() == _pending.words[i]);

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _pending.save();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(services: widget.services)));
    } catch (_) {
      setState(() => _error = 'Couldn’t save your key. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Your recovery phrase')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'These 24 words are the only way back into your data if you lose every device. '
            'Khazana can’t see them and can’t reset them.',
            style: TextStyle(color: muted),
          ),
          const SizedBox(height: 16),
          if (!_confirming) ...[
            Wrap(
              key: const Key('recovery-words'),
              spacing: 16,
              runSpacing: 8,
              children: [for (var i = 0; i < 24; i++) SizedBox(width: 140, child: Text('${i + 1}. ${_pending.words[i]}'))],
            ),
            const SizedBox(height: 12),
            Text('Write them on paper, in order, and keep it somewhere safe. Don’t screenshot them.', style: TextStyle(color: muted)),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => setState(() => _confirming = true), child: const Text('I’ve written them down')),
          ] else ...[
            Text('Check three words', style: Theme.of(context).textTheme.titleMedium),
            for (final i in _asked)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  key: Key('word-$i'),
                  controller: _controller(i),
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(labelText: 'Word ${i + 1}', border: const OutlineInputBorder()),
                ),
              ),
            const SizedBox(height: 12),
            Row(children: [
              TextButton(onPressed: () => setState(() => _confirming = false), child: const Text('Show words again')),
              const Spacer(),
              FilledButton(key: const Key('finish'), onPressed: _correct && !_busy ? _save : null, child: Text(_busy ? 'Saving…' : 'Finish')),
            ]),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ],
      ),
    );
  }
}
