using Khazana.Security.Dpop;
using Khazana.TestKit;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using Shouldly;

namespace Khazana.Security.Tests;

/// <summary>
/// Every way a DPoP proof can be forged, replayed or misdirected, and the one
/// way it is accepted.
/// </summary>
public sealed class DpopProofValidatorTests : IDisposable
{
    private const string Url = "https://api.khazana.app/v1/sync/push";
    private static readonly Uri[] Accepted = [new(Url)];
    private readonly DeviceKey _device = new();
    private readonly DpopProofValidator _validator = new(new MemoryDpopReplayCache(new MemoryCache(new MemoryCacheOptions())), TimeProvider.System);

    [Fact]
    public async Task A_fresh_proof_for_this_request_is_accepted_and_names_the_key()
    {
        var proof = await _validator.ValidateAsync(_device.Proof("POST", Url), "POST", Accepted);
        proof.Jkt.ShouldBe(_device.Jkt);
    }

    [Fact]
    public async Task Query_and_fragment_do_not_matter_but_the_path_does()
    {
        await _validator.ValidateAsync(_device.Proof("POST", Url + "?x=1#f"), "POST", Accepted);
        await Refused(_device.Proof("POST", "https://api.khazana.app/v1/sync/pull"));
    }

    [Fact]
    public async Task The_same_proof_works_once()
    {
        var proof = _device.Proof("POST", Url);
        await _validator.ValidateAsync(proof, "POST", Accepted);
        await Refused(proof, "already used");
    }

    [Fact]
    public Task A_proof_for_another_method_is_refused() => Refused(_device.Proof("GET", Url), "htm");

    [Fact]
    public Task A_proof_for_another_host_is_refused() => Refused(_device.Proof("POST", "https://evil.example/v1/sync/push"), "htu");

    [Fact]
    public Task An_old_proof_is_refused() =>
        Refused(_device.Proof("POST", Url, issuedAt: DateTimeOffset.UtcNow.AddMinutes(-5)), "too old");

    [Fact]
    public Task A_proof_from_the_future_is_refused() =>
        Refused(_device.Proof("POST", Url, issuedAt: DateTimeOffset.UtcNow.AddMinutes(5)), "too old");

    [Fact]
    public Task A_symmetric_signature_is_refused() =>
        Refused(_device.Proof("POST", Url, alg: SecurityAlgorithms.HmacSha256), "signature");

    [Fact]
    public Task A_plain_JWT_type_is_refused() => Refused(_device.Proof("POST", Url, type: "JWT"), "signature");

    [Fact]
    public Task A_key_with_its_private_part_is_refused() =>
        Refused(_device.Proof("POST", Url, leakPrivateKey: true), "private");

    [Fact]
    public async Task With_an_access_token_the_proof_must_name_that_token()
    {
        await _validator.ValidateAsync(_device.Proof("POST", Url, accessToken: "token-a"), "POST", Accepted, "token-a");
        await Should.ThrowAsync<DpopValidationException>(() =>
            _validator.ValidateAsync(_device.Proof("POST", Url, accessToken: "token-a"), "POST", Accepted, "token-b"));
        await Should.ThrowAsync<DpopValidationException>(() =>
            _validator.ValidateAsync(_device.Proof("POST", Url), "POST", Accepted, "token-b"));
    }

    [Fact]
    public async Task Garbage_is_refused_without_throwing_anything_else()
    {
        foreach (var junk in new[] { "", "abc", "a.b.c", "eyJhbGciOiJub25lIn0.e30.", new string('x', 5000) })
            await Should.ThrowAsync<DpopValidationException>(() => _validator.ValidateAsync(junk, "POST", Accepted));
    }

    [Fact]
    public async Task Another_device_signs_with_its_own_key_and_gets_its_own_thumbprint()
    {
        using var other = new DeviceKey();
        var proof = await _validator.ValidateAsync(other.Proof("POST", Url), "POST", Accepted);
        proof.Jkt.ShouldNotBe(_device.Jkt);
    }

    private async Task Refused(string proof, string? reason = null)
    {
        var e = await Should.ThrowAsync<DpopValidationException>(() => _validator.ValidateAsync(proof, "POST", Accepted));
        if (reason is not null) e.Message.ShouldContain(reason);
    }

    public void Dispose() => _device.Dispose();
}
