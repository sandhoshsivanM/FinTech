using System.Collections.Concurrent;
using System.Net.Http.Json;
using Khazana.Identity.Application;
using Khazana.Identity.Domain;
using Microsoft.Extensions.Logging;

namespace Khazana.Identity.Infrastructure;

/// <summary>What the Fake sender "sent", for tests and the demo operator.</summary>
public sealed class FakeSmsLog
{
    private readonly ConcurrentQueue<(string Phone, string Code)> _sent = new();

    public void Record(string phone, string code)
    {
        _sent.Enqueue((phone, code));
        // A demo needs only the latest few; never grow without bound.
        while (_sent.Count > 200) _sent.TryDequeue(out _);
    }

    public IReadOnlyList<(string Phone, string Code)> Sent => [.. _sent];
}

/// <summary>
/// Free stand-in for a real SMS provider (ADR 0003): writes the code to the log
/// and sends nothing. The code is in the log on purpose, for the developer or
/// demo operator, so it is refused in Production at startup.
/// </summary>
public sealed partial class LogSmsSender(FakeSmsLog sent, ILogger<LogSmsSender> log) : ISmsSender
{
    public Task SendCodeAsync(string e164, string code, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(e164);
        ArgumentNullException.ThrowIfNull(code);
        sent.Record(e164, code);
        Sent(log, PhoneNumbers.Mask(e164), code);
        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "FAKE SMS to {Phone}: your Khazana sign-in code is {Code} (demo sender, nothing was texted)")]
    private static partial void Sent(ILogger logger, string phone, string code);
}

public sealed class Msg91Options
{
    public required string AuthKey { get; init; }

    /// <summary>The DLT-approved flow template id; its one variable is the code.</summary>
    public required string TemplateId { get; init; }
}

/// <summary>
/// MSG91's Flow API. Not usable until the business is registered on DLT and a
/// template approved (docs/online/launch-checklist.md), which is why selecting
/// it without its settings stops startup. Written to MSG91's documented request;
/// it has not run against the live service.
/// </summary>
public sealed class Msg91SmsSender(HttpClient http, Msg91Options options) : ISmsSender
{
    public async Task SendCodeAsync(string e164, string code, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(e164);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("https://control.msg91.com/api/v5/flow"))
        {
            Content = JsonContent.Create(new
            {
                template_id = options.TemplateId,
                short_url = "0",
                recipients = new[] { new { mobiles = e164.TrimStart('+'), var1 = code } },
            }),
        };
        request.Headers.Add("authkey", options.AuthKey);
        try
        {
            using var response = await http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            // The status only: the body can echo the number.
            if (!response.IsSuccessStatusCode) throw new SmsSendFailedException($"MSG91 answered {(int)response.StatusCode}.");
        }
        catch (HttpRequestException e)
        {
            throw new SmsSendFailedException("MSG91 unreachable.", e);
        }
    }
}
