// Google sign-in. The ID token's nonce is this device's DPoP key thumbprint,
// so Identity accepts the token only from this device (IdTokenVerifiers.cs).
import 'package:google_sign_in/google_sign_in.dart';

/// What the gateway client needs from Google; tests replace it.
abstract class GoogleIdTokens {
  /// An ID token whose nonce is [nonce]. Throws if the user backs out.
  Future<String> idToken(String nonce);
}

/// Build-time OAuth client ids (--dart-define), like the web build's.
const googleServerClientId = String.fromEnvironment('KHAZANA_GOOGLE_SERVER_CLIENT_ID');
const googleIosClientId = String.fromEnvironment('KHAZANA_GOOGLE_IOS_CLIENT_ID');

class GoogleSignInTokens implements GoogleIdTokens {
  @override
  Future<String> idToken(String nonce) async {
    // The nonce is fixed at initialize time, so each sign-in re-initialises.
    await GoogleSignIn.instance.initialize(
      clientId: googleIosClientId.isEmpty ? null : googleIosClientId,
      serverClientId: googleServerClientId.isEmpty ? null : googleServerClientId,
      nonce: nonce,
    );
    final account = await GoogleSignIn.instance.authenticate();
    final token = account.authentication.idToken;
    if (token == null) throw StateError('Google did not return an ID token.');
    return token;
  }
}
