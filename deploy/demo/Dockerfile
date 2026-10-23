# One image recipe for every backend service: PROJECT is the folder under
# backend/ that holds the .csproj, ASSEMBLY the DLL it produces.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG PROJECT
WORKDIR /src
COPY backend/ backend/
RUN dotnet publish "backend/${PROJECT}" -c Release -o /app -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG ASSEMBLY
ENV ASSEMBLY=${ASSEMBLY} \
    # Port 80, so the services' plain names (http://identity-api, as the gateway's
    # config spells them) resolve on Docker's network as-is. Docker lets a non-root
    # process bind it inside a container.
    ASPNETCORE_HTTP_PORTS=80 \
    # Workstation GC: nine services share one small VM; server GC reserves a heap per core.
    DOTNET_gcServer=0
WORKDIR /app
COPY --from=build /app .
# The image's non-root user (uid 1654).
USER $APP_UID
ENTRYPOINT ["sh", "-c", "exec dotnet \"$ASSEMBLY.dll\""]
