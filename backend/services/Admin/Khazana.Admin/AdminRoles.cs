namespace Khazana.Admin;

/// <summary>Admin roles (design doc §8.10). Neither role can see personal or financial data; none exists here.</summary>
public static class AdminRoles
{
    /// <summary>Dashboard, user directory, sign-in history.</summary>
    public const string Support = "support";

    /// <summary>Everything Support sees, plus the audit log and its integrity check.</summary>
    public const string Security = "security";

    public const string SupportPolicy = "admin.support";
    public const string SecurityPolicy = "admin.security";
}
