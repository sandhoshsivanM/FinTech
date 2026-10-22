using System.Security.Claims;
using Khazana.Admin;
using Khazana.Admin.Components;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();

var devLogin = builder.Configuration.GetValue("Admin:DevLogin", false);
if (devLogin && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Admin:DevLogin is allowed only in Development: it lets anyone in as any role.");

// Outside Development the panel is served over HTTPS only, with __Host- cookies
// (Secure, whole-site, no Domain). A laptop run over plain HTTP can't set
// Secure cookies, so Development alone relaxes this.
var strictCookies = !builder.Environment.IsDevelopment();
string CookieName(string name) => strictCookies ? $"__Host-{name}" : name;
var cookiePolicy = strictCookies ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;

var reportingKey = builder.Configuration["Admin:ReportingKey"];
if (string.IsNullOrEmpty(reportingKey) || reportingKey.Length < 32)
    throw new InvalidOperationException("Admin:ReportingKey must be at least 32 characters (the Reporting internal key).");

builder.Services.AddHttpClient<ReportingClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Admin:ReportingUrl"]!.TrimEnd('/') + "/");
    c.DefaultRequestHeaders.Add("X-Khazana-Internal-Key", reportingKey);
});

var auth = builder.Services.AddAuthentication(o =>
{
    o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    o.DefaultChallengeScheme = devLogin ? CookieAuthenticationDefaults.AuthenticationScheme : OpenIdConnectDefaults.AuthenticationScheme;
})
.AddCookie(o =>
{
    o.LoginPath = "/login";
    o.AccessDeniedPath = "/denied";
    o.Cookie.Name = CookieName("khazana-admin");
    o.Cookie.HttpOnly = true;
    // Lax, not Strict: the sign-in comes back from the identity provider, a
    // cross-site navigation, and a Strict cookie isn't sent on it, so every
    // sign-in would loop. Forms are protected by antiforgery tokens instead.
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = cookiePolicy;
    // Short sessions: an unattended admin screen closes itself.
    o.ExpireTimeSpan = TimeSpan.FromMinutes(15);
    o.SlidingExpiration = true;
});

if (!devLogin)
{
    // Staff sign in with the organisation's identity provider (Entra ID, Google
    // Workspace, Keycloak...), which enforces FIDO2 security keys (§8.10).
    auth.AddOpenIdConnect(o =>
    {
        builder.Configuration.GetSection("Admin:Oidc").Bind(o);
        o.ResponseType = "code";
        o.UsePkce = true;
        o.SaveTokens = false;
        o.MapInboundClaims = false;
        o.Scope.Add("email");
        o.TokenValidationParameters.RoleClaimType = "roles";
        o.TokenValidationParameters.NameClaimType = "email";
        // The audit log names staff by the provider's stable subject, so a
        // sign-in without one is refused.
        o.Events.OnTokenValidated = ctx =>
        {
            if (string.IsNullOrEmpty(ctx.Principal?.FindFirst("sub")?.Value)) ctx.Fail("The identity provider sent no subject.");
            return Task.CompletedTask;
        };
    });
}

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(AdminRoles.SupportPolicy, p => p.RequireRole(AdminRoles.Support, AdminRoles.Security))
    .AddPolicy(AdminRoles.SecurityPolicy, p => p.RequireRole(AdminRoles.Security));
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddRazorComponents();
builder.Services.AddAntiforgery(o =>
{
    o.Cookie.Name = CookieName("khazana-admin-af");
    o.Cookie.SecurePolicy = cookiePolicy;
});

var app = builder.Build();
if (strictCookies)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.Use((ctx, next) =>
{
    var h = ctx.Response.Headers;
    // No scripts at all: pages are rendered on the server and use plain links and forms.
    h.ContentSecurityPolicy = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'";
    h.XContentTypeOptions = "nosniff";
    h.XFrameOptions = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h.CacheControl = "no-store";
    return next(ctx);
});
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapDefaultEndpoints();

if (devLogin)
{
    // Development only (guarded above): pick a role, get a cookie.
    app.MapPost("/login/dev", async (HttpContext http, IAntiforgery antiforgery) =>
    {
        if (!await antiforgery.IsRequestValidAsync(http).ConfigureAwait(false)) return Results.BadRequest();
        var form = await http.Request.ReadFormAsync().ConfigureAwait(false);
        var role = form["role"].ToString() is AdminRoles.Security ? AdminRoles.Security : AdminRoles.Support;
        var identity = new ClaimsIdentity(
            [new Claim("sub", $"dev-{role}"), new Claim(ClaimTypes.Email, $"dev-{role}@localhost"), new Claim(ClaimTypes.Role, role)],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(new ClaimsPrincipal(identity)).ConfigureAwait(false);
        return Results.LocalRedirect("/");
    }).DisableAntiforgery();
}
// Antiforgery is checked explicitly: the middleware only records the result,
// and these endpoints read the form themselves.
app.MapPost("/logout", async (HttpContext http, IAntiforgery antiforgery) =>
{
    if (!await antiforgery.IsRequestValidAsync(http).ConfigureAwait(false)) return Results.BadRequest();
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme).ConfigureAwait(false);
    return Results.LocalRedirect("/login");
}).DisableAntiforgery();

app.MapRazorComponents<App>();
app.Run();

/// <summary>Exposed for WebApplicationFactory in the tests.</summary>
public partial class Program;
