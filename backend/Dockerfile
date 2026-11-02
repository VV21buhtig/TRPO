# Docker-образ REST API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY FastFood.Api/FastFood.Api.csproj FastFood.Api/
RUN dotnet restore FastFood.Api/FastFood.Api.csproj

COPY FastFood.Api/ FastFood.Api/
RUN dotnet publish FastFood.Api/FastFood.Api.csproj \
    -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "FastFood.Api.dll"]
