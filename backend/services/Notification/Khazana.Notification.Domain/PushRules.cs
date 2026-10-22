namespace Khazana.Notification.Domain;

public enum PushKind
{
    /// <summary>Silent, data-only: "another device pushed, time to sync". Carries nothing else.</summary>
    Sync,

    /// <summary>A visible alert: a device was added to the account.</summary>
    NewDevice,
}

/// <summary>
/// What a push says. Lock-screen safe by construction (design doc §14.2):
/// no amounts, no merchants, no names, nothing from the user's data, which
/// this service never has anyway.
/// </summary>
/// <param name="CollapseKey">Newer pushes with the same key replace older undelivered ones.</param>
public sealed record PushMessage(PushKind Kind, string? Title, string? Body, string CollapseKey)
{
    public bool IsSilent => Kind == PushKind.Sync;
}

public static class PushContent
{
    public static readonly PushMessage SyncNudge = new(PushKind.Sync, null, null, "sync");

    public static PushMessage NewDevice(string platform) => new(
        PushKind.NewDevice,
        "New device on your account",
        $"A new {PlatformName(platform)} device was added to your Khazana account. If this wasn't you, remove it in Settings, then Devices.",
        "new-device");

    private static string PlatformName(string platform) => platform switch
    {
        "ios" => "iPhone or iPad",
        "android" => "Android",
        "web" => "web browser",
        "macos" => "Mac",
        "windows" => "Windows",
        "linux" => "Linux",
        _ => "new",
    };
}

public static class PushProviders
{
    public const string Fcm = "fcm";
    public const string Apns = "apns";
    public const string WebPush = "webpush";

    public static readonly IReadOnlySet<string> Known = new HashSet<string>(StringComparer.Ordinal) { Fcm, Apns, WebPush };

    /// <summary>FCM tokens run to ~200 characters, APNs to 64 hex, Web Push subscriptions to ~500. Kept under the Postgres index limit.</summary>
    public const int MaxTokenLength = 2048;

    public static bool IsValid(string? provider, string? token) =>
        provider is not null && Known.Contains(provider) &&
        !string.IsNullOrWhiteSpace(token) && token.Length <= MaxTokenLength && !token.Any(char.IsControl);
}
