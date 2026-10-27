Test-only TLS fixtures for pinning_test.dart. ca.pem signs server.pem (CN=localhost,
SAN localhost + 127.0.0.1). The CA key was deleted after signing; nothing here is
used outside tests. server.pem is valid 800 days (Apple rejects longer leaves) from
2026-10-27: when it expires, regenerate a CA + leaf with openssl and update the
pin in pinning_test.dart (openssl x509 -in server.pem -pubkey -noout |
openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64).
