using Wolverine;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;
using Wolverine.Util;

namespace Khazana.Messaging;

/// <summary>
/// The one place messaging is configured, so every service gets the same
/// guarantees without re-deciding them.
/// </summary>
public static class KhazanaMessaging
{
    /// <param name="serviceName">Names this service's queues and outbox rows.</param>
    /// <param name="rabbitMqConnectionString">amqp:// URI (injected by Aspire).</param>
    /// <param name="postgresConnectionString">The service's own database.</param>
    public static WolverineOptions UseKhazanaMessaging(
        this WolverineOptions opts,
        string serviceName,
        string rabbitMqConnectionString,
        string postgresConnectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceName);
        ArgumentException.ThrowIfNullOrWhiteSpace(rabbitMqConnectionString);
        ArgumentException.ThrowIfNullOrWhiteSpace(postgresConnectionString);

        opts.ServiceName = serviceName;

        // Publish/subscribe, one exchange per event and one queue per service:
        //   publisher  -> fanout exchange named by the event's identity
        //   each service that handles it -> its own queue "<service>.<identity>",
        //   bound to that exchange.
        // Every interested service gets every event. (Wolverine's default names
        // the queue after the event alone, so all services would share one queue
        // and RabbitMQ would hand each event to just one of them.)
        //
        // Only the versioned contracts in Khazana.Messaging.Contracts cross the
        // broker. A service's internal commands (IngestNav and the like) stay on
        // its own durable local queues: put on RabbitMQ, anything with broker
        // access could trigger them, and their C# names would become a contract.
        opts.UseRabbitMq(new Uri(rabbitMqConnectionString))
            .AutoProvision()
            .UseConventionalRouting(routing =>
            {
                routing.IncludeTypes(IsContract);
                routing.QueueNameForListener(type => QueueName(serviceName, type));
                routing.ConfigureListeners((listener, context) =>
                    listener.BindToExchange(ExchangeType.Fanout, context.MessageType.ToMessageTypeName(), bindingKey: string.Empty));
            });

        // Outbox and inbox tables live in the service's own database, in a
        // schema of their own, next to the data they protect.
        opts.PersistMessagesWithPostgresql(postgresConnectionString, "wolverine");

        // Outbox: an outgoing message is stored in the same transaction as the
        // change it announces, then relayed — no "saved but never published".
        opts.Policies.UseDurableOutboxOnAllSendingEndpoints();

        // Inbox: incoming message ids are recorded, so a redelivered message is
        // recognised and not applied twice (idempotent consumers).
        opts.Policies.UseDurableInboxOnAllListeners();
        opts.Policies.UseDurableLocalQueues();

        // Handlers that touch the database run inside a transaction that also
        // commits their outgoing messages.
        opts.Policies.AutoApplyTransactions();

        return opts;
    }

    /// <summary>This service's own queue for an event: never shared with another service.</summary>
    public static string QueueName(string serviceName, Type messageType) =>
        $"{serviceName}.{(messageType ?? throw new ArgumentNullException(nameof(messageType))).ToMessageTypeName()}";

    /// <summary>A message type that may travel between services.</summary>
    public static bool IsContract(Type type) =>
        type?.Namespace == typeof(Contracts.PricesPublishedV1).Namespace;
}
