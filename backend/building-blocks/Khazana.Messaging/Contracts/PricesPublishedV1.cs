using Wolverine.Attributes;

namespace Khazana.Messaging.Contracts;

/// <summary>
/// Market Data finished publishing a day's price file. Carries identifiers
/// only — never prices, holdings or anything about a user — like every event
/// (design doc §8.3).
/// </summary>
/// <remarks>
/// Contracts are versioned by name and change only additively. A breaking
/// change is a new <c>PricesPublishedV2</c> published alongside this one until
/// every consumer has moved. The message identity is pinned so renaming the C#
/// type can never silently change what goes on the wire.
/// </remarks>
[MessageIdentity("khazana.market.prices-published.v1")]
public sealed record PricesPublishedV1(DateOnly Date, string Kind, int RowCount, string Sha256);
