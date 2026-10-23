using Amazon.S3;
using Amazon.S3.Model;
using Khazana.Sync.Application;
using Khazana.Sync.Domain;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Khazana.Sync.Infrastructure;

/// <summary>
/// Development only: attachments as files under a directory. Paths are built
/// from a Guid and an id already checked against <see cref="AttachmentRules"/>,
/// so nothing a client sends can climb out of the root.
/// </summary>
public sealed class LocalDiskAttachmentStore(string root) : IAttachmentStore
{
    private string UserDir(Guid userId) => Path.Combine(root, userId.ToString("N"));

    private string PathFor(Guid userId, string id) =>
        AttachmentRules.IsValidId(id) ? Path.Combine(UserDir(userId), id) : throw new ArgumentException("Bad attachment id.", nameof(id));

    public async Task PutAsync(Guid userId, string attachmentId, Stream content, CancellationToken ct)
    {
        Directory.CreateDirectory(UserDir(userId));
        var target = PathFor(userId, attachmentId);
        var temp = target + ".partial";
        await using (var file = File.Create(temp)) await content.CopyToAsync(file, ct).ConfigureAwait(false);
        File.Move(temp, target, overwrite: true);
    }

    public Task<Stream?> GetAsync(Guid userId, string attachmentId, CancellationToken ct)
    {
        var path = PathFor(userId, attachmentId);
        return Task.FromResult<Stream?>(File.Exists(path) ? File.OpenRead(path) : null);
    }

    public Task DeleteAsync(Guid userId, string attachmentId, CancellationToken ct)
    {
        File.Delete(PathFor(userId, attachmentId));
        return Task.CompletedTask;
    }

    public Task DeleteUserAsync(Guid userId, CancellationToken ct)
    {
        if (Directory.Exists(UserDir(userId))) Directory.Delete(UserDir(userId), recursive: true);
        return Task.CompletedTask;
    }
}

/// <summary>Attachments in an S3 bucket (server-side encryption on top of the client's).</summary>
public sealed class S3AttachmentStore(IAmazonS3 s3, string bucket) : IAttachmentStore
{
    private static string Key(Guid userId, string id) => $"{userId:N}/{id}";

    public Task PutAsync(Guid userId, string attachmentId, Stream content, CancellationToken ct) =>
        s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = bucket,
            Key = Key(userId, attachmentId),
            InputStream = content,
            AutoCloseStream = false,
            ServerSideEncryptionMethod = ServerSideEncryptionMethod.AWSKMS,
        }, ct);

    public async Task<Stream?> GetAsync(Guid userId, string attachmentId, CancellationToken ct)
    {
        try
        {
            var response = await s3.GetObjectAsync(bucket, Key(userId, attachmentId), ct).ConfigureAwait(false);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public Task DeleteAsync(Guid userId, string attachmentId, CancellationToken ct) =>
        s3.DeleteObjectAsync(bucket, Key(userId, attachmentId), ct);

    public async Task DeleteUserAsync(Guid userId, CancellationToken ct)
    {
        string? token = null;
        do
        {
            var page = await s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = bucket, Prefix = $"{userId:N}/", ContinuationToken = token,
            }, ct).ConfigureAwait(false);
            if (page.S3Objects is { Count: > 0 } objects)
            {
                await s3.DeleteObjectsAsync(new DeleteObjectsRequest
                {
                    BucketName = bucket,
                    Objects = [.. objects.Select(o => new KeyVersion { Key = o.Key })],
                }, ct).ConfigureAwait(false);
            }
            token = page.IsTruncated == true ? page.NextContinuationToken : null;
        }
        while (token is not null);
    }
}

/// <summary>
/// For a deployment with no object store (the free demo): records sync as
/// usual, attachments are refused with 503, and an account purge has nothing
/// to remove here, so deletion still completes.
/// </summary>
public sealed class DisabledAttachmentStore : IAttachmentStore
{
    private static SyncException Unavailable() => new(SyncError.Unavailable, "Attachments are disabled in this deployment.");

    public Task PutAsync(Guid userId, string attachmentId, Stream content, CancellationToken ct) => throw Unavailable();
    public Task<Stream?> GetAsync(Guid userId, string attachmentId, CancellationToken ct) => throw Unavailable();
    public Task DeleteAsync(Guid userId, string attachmentId, CancellationToken ct) => throw Unavailable();
    public Task DeleteUserAsync(Guid userId, CancellationToken ct) => Task.CompletedTask;
}

public static class DependencyInjection
{
    /// <summary>
    /// <c>Providers:Attachments</c> = <c>LocalDisk</c> (Development only; refused
    /// elsewhere, where the files would sit on one container's disk) or <c>S3</c>
    /// (<c>Attachments:Bucket</c>, credentials from the platform role), or
    /// <c>Disabled</c> (any environment: attachments refused with 503).
    /// </summary>
    public static IServiceCollection AddSyncInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        switch (configuration["Providers:Attachments"] ?? "LocalDisk")
        {
            case "LocalDisk" when !environment.IsDevelopment():
                throw new InvalidOperationException("Providers:Attachments=LocalDisk is allowed only in Development.");
            case "LocalDisk":
                var root = configuration["Attachments:Root"] ?? Path.Combine(Path.GetTempPath(), "khazana-attachments");
                services.AddSingleton<IAttachmentStore>(new LocalDiskAttachmentStore(root));
                break;
            case "S3":
                var bucket = configuration["Attachments:Bucket"] ?? throw new InvalidOperationException("Attachments:Bucket is not set.");
                services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client());
                services.AddSingleton<IAttachmentStore>(sp => new S3AttachmentStore(sp.GetRequiredService<IAmazonS3>(), bucket));
                break;
            case "Disabled":
                services.AddSingleton<IAttachmentStore, DisabledAttachmentStore>();
                break;
            default:
                throw new InvalidOperationException("Unknown Providers:Attachments. Use LocalDisk, S3 or Disabled.");
        }
        return services;
    }
}
