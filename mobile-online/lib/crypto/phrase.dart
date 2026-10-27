// The 24-word recovery phrase (BIP-39 encoding of 256 bits plus an 8-bit
// checksum), as webapp-online/src/lib/crypto/phrase.ts. Shown once, never sent
// anywhere; the only way back in if every device is lost (ADR 0005).
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

import 'wordlist.dart';

class PhraseError implements Exception {
  PhraseError(this.message);
  final String message;
  @override
  String toString() => message;
}

String _prefix(String w) => w.length < 4 ? w : w.substring(0, 4);

final _byPrefix = {for (var i = 0; i < bip39Words.length; i++) _prefix(bip39Words[i]): i};

String _bits(Iterable<int> bytes) => bytes.map((b) => b.toRadixString(2).padLeft(8, '0')).join();

String _checksumBits(Uint8List entropy) => _bits([SHA256Digest().process(entropy)[0]]);

/// 32 bytes of entropy to 24 words.
List<String> toPhrase(Uint8List entropy) {
  if (entropy.length != 32) throw ArgumentError('A recovery phrase encodes exactly 32 bytes.');
  final all = _bits(entropy) + _checksumBits(entropy);
  return List.generate(24, (i) => bip39Words[int.parse(all.substring(i * 11, i * 11 + 11), radix: 2)]);
}

/// Typed words to the 24 canonical words. Forgiving about case, spacing and
/// punctuation; accepts each word's first four letters. Throws [PhraseError]
/// for an unknown word, a wrong count or a failed checksum.
List<String> parsePhrase(String input) {
  final typed = input.toLowerCase().split(RegExp(r'[^a-z]+')).where((w) => w.isNotEmpty).toList();
  if (typed.length != 24) throw PhraseError('Enter all 24 words (you entered ${typed.length}).');
  final indexes = <int>[];
  for (var i = 0; i < typed.length; i++) {
    final w = typed[i];
    final index = _byPrefix[_prefix(w)];
    if (index == null || !bip39Words[index].startsWith(w)) throw PhraseError('Word ${i + 1} ("$w") is not in the list.');
    indexes.add(index);
  }
  final all = indexes.map((n) => n.toRadixString(2).padLeft(11, '0')).join();
  final entropy = Uint8List.fromList(List.generate(32, (i) => int.parse(all.substring(i * 8, i * 8 + 8), radix: 2)));
  if (all.substring(256) != _checksumBits(entropy)) {
    throw PhraseError('These words don’t form a valid phrase. Check for a typo or two words swapped.');
  }
  return [for (final n in indexes) bip39Words[n]];
}
