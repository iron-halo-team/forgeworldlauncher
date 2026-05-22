package com.forgeworld.authbridge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import fr.xephi.authme.api.v3.AuthMeApi;
import fr.xephi.authme.api.v3.AuthMePlayer;
import org.bukkit.Bukkit;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class ForgeWorldAuthBridgePlugin extends JavaPlugin implements Listener {
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final String DEFAULT_USERNAME_REGEX = "^[A-Za-z0-9_]{3,16}$";

    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, LaunchSession> launchSessions = new ConcurrentHashMap<>();
    private final Map<String, RememberSession> rememberSessions = new ConcurrentHashMap<>();
    private final Map<String, RateBucket> rateBuckets = new ConcurrentHashMap<>();
    private final Object sessionsLock = new Object();

    private HttpServer httpServer;
    private ExecutorService httpExecutor;
    private AuthMeApi authMeApi;
    private File sessionsFile;
    private Pattern usernamePattern;

    private boolean httpEnabled;
    private String bindHost;
    private int port;
    private boolean trustProxyHeaders;
    private String corsOrigin;
    private boolean relayEnabled;
    private String relayBaseUrl;
    private String relaySharedSecret;
    private int relayRequestTimeoutMillis;
    private long relayWarningThrottleMillis;
    private HttpClient relayHttpClient;
    private volatile long lastRelayWarningAtMillis;
    private boolean autoLoginEnabled;
    private boolean requireIpMatch;
    private int autoLoginDelayTicks;
    private long launchSessionMillis;
    private long rememberSessionMillis;
    private int maxBodyBytes;
    private int minPasswordLength;
    private int maxPasswordLength;
    private int rateLimitWindowMillis;
    private int rateLimitMaxAttempts;
    private boolean logSuccesses;

    private volatile int cachedPlayersOnline;
    private volatile int cachedMaxPlayers;
    private volatile String cachedServerVersion = "";
    private volatile String cachedMotd = "";
    private volatile String cachedPlayerNamesJson = "[]";

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadBridgeConfig();

        authMeApi = AuthMeApi.getInstance();
        if (authMeApi == null) {
            getLogger().severe("AuthMe API is not available. Make sure AuthMe is installed and loaded before ForgeWorldAuthBridge.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        loadRememberSessions();
        Bukkit.getPluginManager().registerEvents(this, this);
        startStatusCacheUpdater();
        startSessionCleanupTask();
        startHttpServer();
        startRelayWorker();
    }

    @Override
    public void onDisable() {
        stopHttpServer();
        saveRememberSessions();
        launchSessions.clear();
        rememberSessions.clear();
        rateBuckets.clear();
    }

    private void reloadBridgeConfig() {
        reloadConfig();

        httpEnabled = getConfig().getBoolean("http.enabled", true);
        bindHost = getConfig().getString("http.bind-host", "0.0.0.0");
        port = getConfig().getInt("http.port", 25797);
        trustProxyHeaders = getConfig().getBoolean("http.trust-proxy-headers", false);
        corsOrigin = getConfig().getString("http.cors-origin", "*");

        relayEnabled = getConfig().getBoolean("relay.enabled", false);
        relayBaseUrl = trimTrailingSlash(getConfig().getString("relay.base-url", ""));
        relaySharedSecret = getConfig().getString("relay.shared-secret", "");
        relayRequestTimeoutMillis = Math.max(2_000, getConfig().getInt("relay.request-timeout-millis", 8_000));
        relayWarningThrottleMillis = Math.max(
            10_000L,
            getConfig().getLong("relay.warning-throttle-seconds", 60L) * 1_000L
        );

        autoLoginEnabled = getConfig().getBoolean("auto-login.enabled", true);
        requireIpMatch = getConfig().getBoolean("auto-login.require-ip-match", false);
        autoLoginDelayTicks = Math.max(1, getConfig().getInt("auto-login.delay-ticks", 10));

        launchSessionMillis = Math.max(
            60_000L,
            getConfig().getInt("security.launch-session-minutes", 15) * 60_000L
        );
        rememberSessionMillis = Math.max(
            86_400_000L,
            (long) getConfig().getInt("security.remember-days", 30) * 86_400_000L
        );
        maxBodyBytes = Math.max(512, getConfig().getInt("security.max-body-bytes", 4096));
        rateLimitWindowMillis = Math.max(
            10_000,
            getConfig().getInt("security.rate-limit-window-seconds", 60) * 1000
        );
        rateLimitMaxAttempts = Math.max(1, getConfig().getInt("security.rate-limit-max-attempts", 8));

        minPasswordLength = Math.max(1, getConfig().getInt("password.min-length", 6));
        maxPasswordLength = Math.max(minPasswordLength, getConfig().getInt("password.max-length", 128));
        usernamePattern = Pattern.compile(getConfig().getString("username.regex", DEFAULT_USERNAME_REGEX));
        logSuccesses = getConfig().getBoolean("logging.log-successes", false);
    }

    private void startHttpServer() {
        if (!httpEnabled) {
            getLogger().warning("HTTP API is disabled. Launcher registration and auto-login will not work.");
            return;
        }

        try {
            httpServer = HttpServer.create(new InetSocketAddress(bindHost, port), 0);
            httpServer.createContext("/auth/health", this::handleHealth);
            httpServer.createContext("/auth/register", exchange -> handleAuth(exchange, AuthAction.REGISTER));
            httpServer.createContext("/auth/login", exchange -> handleAuth(exchange, AuthAction.LOGIN));
            httpServer.createContext("/auth/session", this::handleSession);
            httpServer.createContext("/auth/logout", this::handleLogout);
            httpServer.createContext("/auth/profile", this::handleProfile);
            httpServer.createContext("/auth/email", this::handleEmailUpdate);
            httpServer.createContext("/auth/password", this::handlePasswordChange);
            httpServer.createContext("/auth/recovery", this::handlePasswordRecovery);
            httpServer.createContext("/server/status", this::handleServerStatus);

            httpExecutor = Executors.newFixedThreadPool(4, task -> {
                Thread thread = new Thread(task, "ForgeWorldAuthBridge-HTTP");
                thread.setDaemon(true);
                return thread;
            });
            httpServer.setExecutor(httpExecutor);
            httpServer.start();

            getLogger().info("HTTP API is listening on " + bindHost + ":" + port + ".");
            getLogger().info("Launcher endpoint: http://<server-host>:" + port);
        } catch (IOException error) {
            getLogger().severe("Unable to start HTTP API on " + bindHost + ":" + port + ": " + error.getMessage());
            getLogger().severe("Launcher registration and auto-login require one free public TCP port.");
            Bukkit.getPluginManager().disablePlugin(this);
        }
    }

    private void stopHttpServer() {
        if (httpServer != null) {
            httpServer.stop(1);
            httpServer = null;
        }

        if (httpExecutor != null) {
            httpExecutor.shutdownNow();
            httpExecutor = null;
        }
    }

    private void startStatusCacheUpdater() {
        updateCachedServerStatus();
        Bukkit.getScheduler().runTaskTimer(this, this::updateCachedServerStatus, 20L, 100L);
    }

    private void startSessionCleanupTask() {
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::cleanupExpiredSessions, 20L * 60L, 20L * 60L);
    }

    private void startRelayWorker() {
        if (!relayEnabled) {
            return;
        }

        if (relayBaseUrl.isBlank() || relaySharedSecret.isBlank()) {
            getLogger().warning("Web relay is enabled, but relay.base-url or relay.shared-secret is empty.");
            return;
        }

        relayHttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(relayRequestTimeoutMillis))
            .build();

        long initialDelayTicks = Math.max(20L, getConfig().getLong("relay.initial-delay-ticks", 40L));
        long pollIntervalTicks = Math.max(20L, getConfig().getLong("relay.poll-interval-ticks", 40L));
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::pollRelayOnce, initialDelayTicks, pollIntervalTicks);
        getLogger().info("Web relay is enabled: " + relayBaseUrl + ".");
    }

    private void pollRelayOnce() {
        try {
            String responseBody = postRelay("poll", buildRelayStatusJson());
            Map<String, String> response = JsonStrings.parse(responseBody);
            if (isTruthy(response.getOrDefault("empty", "false"))) {
                return;
            }

            String requestId = response.getOrDefault("id", "");
            if (requestId.isBlank()) {
                return;
            }

            AuthOutcome outcome = processRelayRequest(response);
            postRelay("complete", outcome.toRelayJson(requestId));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (Exception error) {
            warnRelayThrottled("Web relay poll failed: " + error.getMessage());
        }
    }

    private AuthOutcome processRelayRequest(Map<String, String> request) {
        String type = request.getOrDefault("type", "");
        String username = request.getOrDefault("username", "").trim();
        String token = request.getOrDefault("token", "");
        String ipAddress = request.getOrDefault("ip", "");

        try {
            return switch (type) {
                case "register" -> {
                    if (isRateLimited(ipAddress)) {
                        yield AuthOutcome.error(429, "Слишком много попыток. Подождите немного.");
                    }
                    yield processAuth(AuthAction.REGISTER, request, ipAddress);
                }
                case "login" -> {
                    if (isRateLimited(ipAddress)) {
                        yield AuthOutcome.error(429, "Слишком много попыток. Подождите немного.");
                    }
                    yield processAuth(AuthAction.LOGIN, request, ipAddress);
                }
                case "session" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> prepareLaunchSession(username, token, ipAddress))
                    .get();
                case "logout" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> logoutAccount(username))
                    .get();
                case "profile" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> getAccountProfile(username, token))
                    .get();
                case "email" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> updateAccountEmail(username, token, request.getOrDefault("email", "").trim()))
                    .get();
                case "password" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> changeAccountPassword(
                        username,
                        token,
                        request.getOrDefault("currentPassword", ""),
                        request.getOrDefault("newPassword", "")
                    ))
                    .get();
                case "recovery" -> Bukkit.getScheduler()
                    .callSyncMethod(this, () -> startPasswordRecovery(username))
                    .get();
                default -> AuthOutcome.error(400, "Неизвестный тип запроса авторизации.");
            };
        } catch (Exception error) {
            getLogger().warning("Relay request failed: " + error.getMessage());
            return AuthOutcome.error(500, "Сервер авторизации не ответил вовремя. Попробуйте ещё раз.");
        }
    }

    private String postRelay(String action, String body) throws IOException, InterruptedException {
        if (relayHttpClient == null) {
            throw new IOException("Relay HTTP client is not initialized.");
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(relayBaseUrl + "/plugin/?action=" + action))
            .timeout(Duration.ofMillis(relayRequestTimeoutMillis))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json; charset=utf-8")
            .header("User-Agent", "ForgeWorldAuthBridge/" + getDescription().getVersion())
            .header("X-ForgeWorld-Secret", relaySharedSecret)
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
            .build();

        HttpResponse<String> response = relayHttpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Relay returned HTTP " + response.statusCode());
        }

        return response.body();
    }

    private String buildRelayStatusJson() {
        return "{"
            + "\"playersOnline\":" + cachedPlayersOnline + ","
            + "\"maxPlayers\":" + cachedMaxPlayers + ","
            + "\"players\":" + cachedPlayerNamesJson + ","
            + "\"serverVersion\":\"" + json(cachedServerVersion) + "\","
            + "\"motd\":\"" + json(cachedMotd) + "\""
            + "}";
    }

    private void warnRelayThrottled(String message) {
        long now = System.currentTimeMillis();
        if (now - lastRelayWarningAtMillis < relayWarningThrottleMillis) {
            return;
        }

        lastRelayWarningAtMillis = now;
        getLogger().warning(message);
    }

    private void updateCachedServerStatus() {
        cachedPlayersOnline = Bukkit.getOnlinePlayers().size();
        cachedMaxPlayers = Bukkit.getMaxPlayers();
        cachedServerVersion = Bukkit.getVersion();
        cachedMotd = Bukkit.getMotd();
        cachedPlayerNamesJson = playerNamesJson();
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        if (!autoLoginEnabled) {
            return;
        }

        Player player = event.getPlayer();
        String usernameKey = normalizeName(player.getName());
        LaunchSession session = launchSessions.get(usernameKey);
        if (session == null || session.expiresAtMillis < System.currentTimeMillis()) {
            launchSessions.remove(usernameKey);
            return;
        }

        String playerIp = getPlayerIp(player);
        if (requireIpMatch && !Objects.equals(playerIp, session.ipAddress)) {
            getLogger().warning("Rejected launcher session for " + player.getName() + ": IP mismatch.");
            return;
        }

        Bukkit.getScheduler().runTaskLater(this, () -> finishAutoLogin(player.getName(), usernameKey), autoLoginDelayTicks);
    }

    private void finishAutoLogin(String playerName, String usernameKey) {
        Player player = Bukkit.getPlayerExact(playerName);
        if (player == null || !player.isOnline()) {
            return;
        }

        if (!authMeApi.isAuthenticated(player)) {
            authMeApi.forceLogin(player);
        }

        launchSessions.remove(usernameKey);
        if (logSuccesses) {
            getLogger().info("Launcher auto-login completed for " + player.getName() + ".");
        }
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }

        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Метод не поддерживается."));
            return;
        }

        sendJson(exchange, 200, "{"
            + "\"ok\":true,"
            + "\"message\":\"Сервер авторизации доступен.\","
            + "\"authMeVersion\":\"" + json(authMeApi.getPluginVersion()) + "\","
            + "\"pluginVersion\":\"" + json(getDescription().getVersion()) + "\""
            + "}");
    }

    private void handleServerStatus(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }

        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Метод не поддерживается."));
            return;
        }

        sendJson(exchange, 200, "{"
            + "\"ok\":true,"
            + "\"online\":true,"
            + "\"displayText\":\"" + json(formatPlayers(cachedPlayersOnline)) + "\","
            + "\"playersOnline\":" + cachedPlayersOnline + ","
            + "\"maxPlayers\":" + cachedMaxPlayers + ","
            + "\"players\":" + playerNamesJson() + ","
            + "\"serverVersion\":\"" + json(cachedServerVersion) + "\","
            + "\"motd\":\"" + json(cachedMotd) + "\","
            + "\"message\":\"Сервер онлайн.\","
            + "\"checkedAt\":\"" + json(Instant.now().toString()) + "\""
            + "}");
    }

    private void handleAuth(HttpExchange exchange, AuthAction action) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Метод не поддерживается."));
            return;
        }

        String ipAddress = getRequestIp(exchange);
        AuthOutcome outcome;
        try {
            if (isRateLimited(ipAddress)) {
                outcome = AuthOutcome.error(429, "Слишком много попыток. Подождите немного.");
            } else {
                Map<String, String> request = JsonStrings.parse(readBody(exchange));
                outcome = processAuth(action, request, ipAddress);
            }
        } catch (IllegalArgumentException error) {
            outcome = AuthOutcome.error(400, "Некорректный запрос авторизации.");
        } catch (Exception error) {
            getLogger().warning("Auth request failed: " + error.getMessage());
            outcome = AuthOutcome.error(500, "Сервер авторизации не ответил вовремя. Попробуйте ещё раз.");
        }

        sendJson(exchange, outcome.statusCode, outcome.toJson());
    }

    private AuthOutcome processAuth(AuthAction action, Map<String, String> request, String ipAddress) throws Exception {
        String username = request.getOrDefault("username", "").trim();
        String password = request.getOrDefault("password", "");
        String email = request.getOrDefault("email", "").trim();

        String validationError = validateCredentials(username, password);
        if (validationError != null) {
            return AuthOutcome.error(400, validationError);
        }

        if (action == AuthAction.REGISTER) {
            String emailValidationError = validateEmail(email);
            if (emailValidationError != null) {
                return AuthOutcome.error(400, emailValidationError);
            }
        }

        return Bukkit.getScheduler()
            .callSyncMethod(this, () -> action == AuthAction.REGISTER
                ? registerAccount(username, password, email, ipAddress)
                : loginAccount(username, password, ipAddress))
            .get();
    }

    private void handleSession(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Метод не поддерживается."));
            return;
        }

        AuthOutcome outcome;
        try {
            Map<String, String> request = JsonStrings.parse(readBody(exchange));
            outcome = prepareLaunchSession(
                request.getOrDefault("username", "").trim(),
                request.getOrDefault("token", ""),
                getRequestIp(exchange)
            );
        } catch (IllegalArgumentException error) {
            outcome = AuthOutcome.error(400, "Некорректный запрос авторизации.");
        } catch (Exception error) {
            getLogger().warning("Session request failed: " + error.getMessage());
            outcome = AuthOutcome.error(500, "Сервер авторизации не ответил вовремя. Попробуйте ещё раз.");
        }

        sendJson(exchange, outcome.statusCode, outcome.toJson());
    }

    private void handleLogout(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) {
            return;
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, jsonError("Метод не поддерживается."));
            return;
        }

        AuthOutcome outcome;
        try {
            Map<String, String> request = JsonStrings.parse(readBody(exchange));
            outcome = logoutAccount(request.getOrDefault("username", ""));
        } catch (IllegalArgumentException error) {
            outcome = AuthOutcome.error(400, "Некорректный запрос авторизации.");
        }

        sendJson(exchange, outcome.statusCode, outcome.toJson());
    }

    private void handleProfile(HttpExchange exchange) throws IOException {
        AuthOutcome outcome = handleAccountAction(exchange, request -> getAccountProfile(
            request.getOrDefault("username", "").trim(),
            request.getOrDefault("token", "")
        ));
        sendAuthOutcome(exchange, outcome);
    }

    private void handleEmailUpdate(HttpExchange exchange) throws IOException {
        AuthOutcome outcome = handleAccountAction(exchange, request -> updateAccountEmail(
            request.getOrDefault("username", "").trim(),
            request.getOrDefault("token", ""),
            request.getOrDefault("email", "").trim()
        ));
        sendAuthOutcome(exchange, outcome);
    }

    private void handlePasswordChange(HttpExchange exchange) throws IOException {
        AuthOutcome outcome = handleAccountAction(exchange, request -> changeAccountPassword(
            request.getOrDefault("username", "").trim(),
            request.getOrDefault("token", ""),
            request.getOrDefault("currentPassword", ""),
            request.getOrDefault("newPassword", "")
        ));
        sendAuthOutcome(exchange, outcome);
    }

    private void handlePasswordRecovery(HttpExchange exchange) throws IOException {
        AuthOutcome outcome = handleAccountAction(exchange, request -> startPasswordRecovery(
            request.getOrDefault("username", "").trim()
        ));
        sendAuthOutcome(exchange, outcome);
    }

    private AuthOutcome handleAccountAction(HttpExchange exchange, AccountAction action) throws IOException {
        if (handleOptions(exchange)) {
            return AuthOutcome.noResponse();
        }

        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            return AuthOutcome.error(405, "Метод не поддерживается.");
        }

        try {
            Map<String, String> request = JsonStrings.parse(readBody(exchange));
            return Bukkit.getScheduler()
                .callSyncMethod(this, () -> action.run(request))
                .get();
        } catch (IllegalArgumentException error) {
            return AuthOutcome.error(400, "Некорректный запрос авторизации.");
        } catch (Exception error) {
            getLogger().warning("Account request failed: " + error.getMessage());
            return AuthOutcome.error(500, "Сервер авторизации не ответил вовремя. Попробуйте ещё раз.");
        }
    }

    private void sendAuthOutcome(HttpExchange exchange, AuthOutcome outcome) throws IOException {
        if (outcome.statusCode > 0) {
            sendJson(exchange, outcome.statusCode, outcome.toJson());
        }
    }

    private AuthOutcome registerAccount(String username, String password, String email, String ipAddress) {
        if (authMeApi.isRegistered(username)) {
            return AuthOutcome.error(409, "Такой аккаунт уже зарегистрирован.");
        }

        if (!authMeApi.registerPlayer(username, password)) {
            return AuthOutcome.error(500, "AuthMe не смог зарегистрировать аккаунт.");
        }

        boolean emailAttached = attachEmailToAccount(username, email);
        String message = emailAttached
            ? "Регистрация выполнена."
            : "Регистрация выполнена, но почту не удалось привязать.";

        if (logSuccesses) {
            getLogger().info("Launcher account registered: " + username + ".");
        }
        return createAuthSuccess(username, ipAddress, message);
    }

    private AuthOutcome loginAccount(String username, String password, String ipAddress) {
        if (!authMeApi.isRegistered(username)) {
            return AuthOutcome.error(404, "Аккаунт с таким ником не зарегистрирован.");
        }

        if (!authMeApi.checkPassword(username, password)) {
            return AuthOutcome.error(401, "Неверный пароль.");
        }

        if (logSuccesses) {
            getLogger().info("Launcher account logged in: " + username + ".");
        }
        return createAuthSuccess(username, ipAddress, "Вход выполнен.");
    }

    private AuthOutcome prepareLaunchSession(String username, String token, String ipAddress) {
        if (!usernamePattern.matcher(username).matches() || token.isBlank()) {
            return AuthOutcome.error(400, "Сессия лаунчера некорректна. Войдите снова.");
        }

        String usernameKey = normalizeName(username);
        RememberSession rememberSession = rememberSessions.get(usernameKey);
        if (rememberSession == null
            || rememberSession.expiresAtMillis < System.currentTimeMillis()
            || !constantTimeEquals(rememberSession.tokenHash, sha256(token))) {
            rememberSessions.remove(usernameKey);
            saveRememberSessions();
            return AuthOutcome.error(401, "Сессия лаунчера истекла. Войдите снова.");
        }

        createLaunchSession(username, ipAddress);
        return new AuthOutcome(
            true,
            200,
            "Вход на сервер подготовлен.",
            username,
            "",
            Instant.ofEpochMilli(rememberSession.expiresAtMillis).toString()
        );
    }

    private AuthOutcome logoutAccount(String username) {
        if (!username.isBlank()) {
            rememberSessions.remove(normalizeName(username));
            saveRememberSessions();
        }

        return new AuthOutcome(true, 200, "Выход выполнен.", username, "", "");
    }

    private AuthOutcome getAccountProfile(String username, String token) {
        AuthOutcome sessionError = validateRememberSession(username, token);
        if (sessionError != null) {
            return sessionError;
        }

        return AuthOutcome.profile(
            200,
            "Профиль загружен.",
            username,
            getEmail(username),
            getLastLauncherLoginMillis(username)
        );
    }

    private AuthOutcome updateAccountEmail(String username, String token, String email) {
        AuthOutcome sessionError = validateRememberSession(username, token);
        if (sessionError != null) {
            return sessionError;
        }

        String emailValidationError = validateEmail(email);
        if (emailValidationError != null || email.isBlank()) {
            return AuthOutcome.error(400, emailValidationError != null ? emailValidationError : "Укажите почту.");
        }

        if (!attachEmailToAccount(username, email)) {
            return AuthOutcome.error(500, "AuthMe не смог привязать почту. Проверьте настройки AuthMe.");
        }

        return AuthOutcome.profile(
            200,
            "Почта обновлена.",
            username,
            getEmail(username).orElse(email),
            getLastLauncherLoginMillis(username)
        );
    }

    private AuthOutcome changeAccountPassword(String username, String token, String currentPassword, String newPassword) {
        AuthOutcome sessionError = validateRememberSession(username, token);
        if (sessionError != null) {
            return sessionError;
        }

        if (!authMeApi.checkPassword(username, currentPassword)) {
            return AuthOutcome.error(401, "Текущий пароль указан неверно.");
        }

        String validationError = validateCredentials(username, newPassword);
        if (validationError != null) {
            return AuthOutcome.error(400, validationError);
        }

        authMeApi.changePassword(username, newPassword);
        return new AuthOutcome(true, 200, "Пароль изменён.", username, "", "");
    }

    private AuthOutcome startPasswordRecovery(String username) {
        if (!usernamePattern.matcher(username).matches()) {
            return AuthOutcome.error(400, "Укажите корректный ник игрока.");
        }

        if (!authMeApi.isRegistered(username)) {
            return AuthOutcome.error(404, "Аккаунт с таким ником не зарегистрирован.");
        }

        Optional<String> email = getEmail(username);
        if (email.isEmpty()) {
            return AuthOutcome.error(409, "К аккаунту не привязана почта. Для восстановления пароля обратитесь к администрации сервера.");
        }

        return AuthOutcome.error(501, "К аккаунту привязана почта, но восстановление письмом из лаунчера недоступно в AuthMe API. Обратитесь к администрации сервера.");
    }

    private AuthOutcome validateRememberSession(String username, String token) {
        if (!usernamePattern.matcher(username).matches() || token.isBlank()) {
            return AuthOutcome.error(400, "Сессия лаунчера некорректна. Войдите снова.");
        }

        RememberSession rememberSession = rememberSessions.get(normalizeName(username));
        if (rememberSession == null
            || rememberSession.expiresAtMillis < System.currentTimeMillis()
            || !constantTimeEquals(rememberSession.tokenHash, sha256(token))) {
            return AuthOutcome.error(401, "Сессия лаунчера истекла. Войдите снова.");
        }

        return null;
    }

    private Optional<String> getEmail(String username) {
        return authMeApi.getPlayerInfo(username)
            .flatMap(AuthMePlayer::getEmail)
            .map(String::trim)
            .filter(value -> !value.isBlank());
    }

    private long getLastLauncherLoginMillis(String username) {
        RememberSession rememberSession = rememberSessions.get(normalizeName(username));
        return rememberSession != null ? rememberSession.lastLoginAtMillis : 0L;
    }

    private AuthOutcome createAuthSuccess(String username, String ipAddress, String message) {
        String token = generateToken();
        long expiresAtMillis = System.currentTimeMillis() + rememberSessionMillis;
        long lastLoginAtMillis = System.currentTimeMillis();
        String usernameKey = normalizeName(username);
        rememberSessions.put(usernameKey, new RememberSession(sha256(token), expiresAtMillis, lastLoginAtMillis));
        saveRememberSessions();
        createLaunchSession(username, ipAddress);

        return new AuthOutcome(
            true,
            200,
            message,
            username,
            token,
            Instant.ofEpochMilli(expiresAtMillis).toString()
        );
    }

    private void createLaunchSession(String username, String ipAddress) {
        launchSessions.put(
            normalizeName(username),
            new LaunchSession(ipAddress, System.currentTimeMillis() + launchSessionMillis)
        );
    }

    private String validateCredentials(String username, String password) {
        if (!usernamePattern.matcher(username).matches()) {
            return "Ник должен содержать 3-16 символов: латиница, цифры или подчёркивание.";
        }

        if (password.length() < minPasswordLength || password.length() > maxPasswordLength) {
            return "Пароль должен содержать от " + minPasswordLength + " до " + maxPasswordLength + " символов.";
        }

        return null;
    }

    private String validateEmail(String email) {
        if (email.isBlank()) {
            return null;
        }

        if (email.length() > 128 || !EMAIL_PATTERN.matcher(email).matches()) {
            return "Почта выглядит некорректно. Проверьте адрес или оставьте поле пустым.";
        }

        return null;
    }

    private boolean attachEmailToAccount(String username, String email) {
        if (email.isBlank()) {
            return true;
        }

        boolean dispatched = Bukkit.dispatchCommand(Bukkit.getConsoleSender(), "authme setemail " + username + " " + email);
        if (!dispatched) {
            getLogger().warning("AuthMe rejected setemail command for " + username + ".");
        }

        return dispatched;
    }

    private boolean handleOptions(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }

        return false;
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (InputStream input = exchange.getRequestBody()) {
            byte[] body = input.readNBytes(maxBodyBytes + 1);
            if (body.length > maxBodyBytes) {
                throw new IllegalArgumentException("Request body is too large.");
            }

            return new String(body, StandardCharsets.UTF_8);
        }
    }

    private void sendJson(HttpExchange exchange, int statusCode, String body) throws IOException {
        addCorsHeaders(exchange);
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("content-type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("access-control-allow-origin", corsOrigin);
        exchange.getResponseHeaders().set("access-control-allow-methods", "GET,POST,OPTIONS");
        exchange.getResponseHeaders().set("access-control-allow-headers", "content-type");
    }

    private boolean isRateLimited(String ipAddress) {
        long now = System.currentTimeMillis();
        RateBucket bucket = rateBuckets.compute(ipAddress, (key, previous) -> {
            if (previous == null || previous.resetAtMillis < now) {
                return new RateBucket(now + rateLimitWindowMillis, 1);
            }

            previous.attempts += 1;
            return previous;
        });

        return bucket != null && bucket.attempts > rateLimitMaxAttempts;
    }

    private void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        launchSessions.entrySet().removeIf(entry -> entry.getValue().expiresAtMillis < now);
        rememberSessions.entrySet().removeIf(entry -> entry.getValue().expiresAtMillis < now);
        rateBuckets.entrySet().removeIf(entry -> entry.getValue().resetAtMillis < now);
        saveRememberSessions();
    }

    private void loadRememberSessions() {
        sessionsFile = new File(getDataFolder(), "sessions.yml");
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(sessionsFile);
        ConfigurationSection section = yaml.getConfigurationSection("sessions");
        if (section == null) {
            return;
        }

        long now = System.currentTimeMillis();
        for (String usernameKey : section.getKeys(false)) {
            String tokenHash = section.getString(usernameKey + ".token-hash", "");
            long expiresAtMillis = section.getLong(usernameKey + ".expires-at", 0L);
            long lastLoginAtMillis = section.getLong(usernameKey + ".last-login-at", 0L);
            if (!tokenHash.isBlank() && expiresAtMillis > now) {
                rememberSessions.put(usernameKey, new RememberSession(tokenHash, expiresAtMillis, lastLoginAtMillis));
            }
        }
    }

    private void saveRememberSessions() {
        if (sessionsFile == null) {
            return;
        }

        synchronized (sessionsLock) {
            try {
                YamlConfiguration yaml = new YamlConfiguration();
                for (Map.Entry<String, RememberSession> entry : rememberSessions.entrySet()) {
                    yaml.set("sessions." + entry.getKey() + ".token-hash", entry.getValue().tokenHash);
                    yaml.set("sessions." + entry.getKey() + ".expires-at", entry.getValue().expiresAtMillis);
                    yaml.set("sessions." + entry.getKey() + ".last-login-at", entry.getValue().lastLoginAtMillis);
                }
                yaml.save(sessionsFile);
            } catch (IOException error) {
                getLogger().warning("Unable to save launcher sessions: " + error.getMessage());
            }
        }
    }

    private String getRequestIp(HttpExchange exchange) {
        if (trustProxyHeaders) {
            String forwardedFor = exchange.getRequestHeaders().getFirst("x-forwarded-for");
            if (forwardedFor != null && !forwardedFor.isBlank()) {
                return forwardedFor.split(",")[0].trim();
            }
        }

        return exchange.getRemoteAddress().getAddress().getHostAddress();
    }

    private String getPlayerIp(Player player) {
        if (player.getAddress() == null || player.getAddress().getAddress() == null) {
            return "";
        }

        return player.getAddress().getAddress().getHostAddress();
    }

    private String normalizeName(String username) {
        return username.toLowerCase(Locale.ROOT);
    }

    private static String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private static boolean isTruthy(String value) {
        return "true".equalsIgnoreCase(value) || "1".equals(value);
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception error) {
            throw new IllegalStateException("SHA-256 is not available", error);
        }
    }

    private static boolean constantTimeEquals(String left, String right) {
        return MessageDigest.isEqual(
            left.getBytes(StandardCharsets.UTF_8),
            right.getBytes(StandardCharsets.UTF_8)
        );
    }

    private static String formatPlayers(int playersOnline) {
        return String.format(Locale.forLanguageTag("ru-RU"), "%,d", playersOnline).replace(',', ' ');
    }

    private String playerNamesJson() {
        List<String> names = new ArrayList<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            names.add(player.getName());
        }

        names.sort(String.CASE_INSENSITIVE_ORDER);
        StringBuilder payload = new StringBuilder("[");
        for (int index = 0; index < names.size(); index += 1) {
            if (index > 0) {
                payload.append(',');
            }
            payload.append('"').append(json(names.get(index))).append('"');
        }
        payload.append(']');
        return payload.toString();
    }

    private static String jsonError(String message) {
        return "{\"ok\":false,\"message\":\"" + json(message) + "\"}";
    }

    private static String json(String value) {
        StringBuilder escaped = new StringBuilder();
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            switch (character) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\b' -> escaped.append("\\b");
                case '\f' -> escaped.append("\\f");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20) {
                        escaped.append(String.format("\\u%04x", (int) character));
                    } else {
                        escaped.append(character);
                    }
                }
            }
        }
        return escaped.toString();
    }

    private enum AuthAction {
        LOGIN,
        REGISTER
    }

    private record LaunchSession(String ipAddress, long expiresAtMillis) {
    }

    private record RememberSession(String tokenHash, long expiresAtMillis, long lastLoginAtMillis) {
    }

    private record AuthOutcome(
        boolean ok,
        int statusCode,
        String message,
        String username,
        String token,
        String expiresAt,
        String email,
        String lastLoginAt
    ) {
        private AuthOutcome(boolean ok, int statusCode, String message, String username, String token, String expiresAt) {
            this(ok, statusCode, message, username, token, expiresAt, "", "");
        }

        private static AuthOutcome noResponse() {
            return new AuthOutcome(true, 0, "", "", "", "");
        }

        private static AuthOutcome error(int statusCode, String message) {
            return new AuthOutcome(false, statusCode, message, "", "", "");
        }

        private static AuthOutcome profile(
            int statusCode,
            String message,
            String username,
            Optional<String> email,
            long lastLoginAtMillis
        ) {
            return profile(
                statusCode,
                message,
                username,
                email.orElse(""),
                lastLoginAtMillis
            );
        }

        private static AuthOutcome profile(
            int statusCode,
            String message,
            String username,
            String email,
            long lastLoginAtMillis
        ) {
            return new AuthOutcome(
                true,
                statusCode,
                message,
                username,
                "",
                "",
                email,
                lastLoginAtMillis > 0 ? Instant.ofEpochMilli(lastLoginAtMillis).toString() : ""
            );
        }

        private String toJson() {
            return "{"
                + "\"ok\":" + ok + ","
                + "\"message\":\"" + json(message) + "\","
                + "\"username\":\"" + json(username) + "\","
                + "\"token\":\"" + json(token) + "\","
                + "\"expiresAt\":\"" + json(expiresAt) + "\","
                + "\"email\":\"" + json(email) + "\","
                + "\"hasEmail\":" + (!email.isBlank()) + ","
                + "\"lastLoginAt\":\"" + json(lastLoginAt) + "\""
                + "}";
        }

        private String toRelayJson(String requestId) {
            return "{"
                + "\"id\":\"" + json(requestId) + "\","
                + "\"statusCode\":" + statusCode + ","
                + toJson().substring(1);
        }
    }

    @FunctionalInterface
    private interface AccountAction {
        AuthOutcome run(Map<String, String> request);
    }

    private static final class RateBucket {
        private final long resetAtMillis;
        private int attempts;

        private RateBucket(long resetAtMillis, int attempts) {
            this.resetAtMillis = resetAtMillis;
            this.attempts = attempts;
        }
    }

    private static final class JsonStrings {
        private final String source;
        private int offset;

        private JsonStrings(String source) {
            this.source = source;
        }

        private static Map<String, String> parse(String source) {
            JsonStrings parser = new JsonStrings(source);
            return parser.parseObject();
        }

        private Map<String, String> parseObject() {
            Map<String, String> values = new ConcurrentHashMap<>();
            skipWhitespace();
            expect('{');
            skipWhitespace();
            if (peek('}')) {
                offset += 1;
                ensureEnd();
                return values;
            }

            while (offset < source.length()) {
                String key = parseString();
                skipWhitespace();
                expect(':');
                skipWhitespace();
                values.put(key, parseValueAsString());
                skipWhitespace();

                if (peek('}')) {
                    offset += 1;
                    ensureEnd();
                    return values;
                }

                expect(',');
                skipWhitespace();
            }

            throw new IllegalArgumentException("Unexpected end of JSON");
        }

        private String parseValueAsString() {
            if (peek('"')) {
                return parseString();
            }

            int start = offset;
            while (offset < source.length()) {
                char character = source.charAt(offset);
                if (character == ',' || character == '}' || Character.isWhitespace(character)) {
                    break;
                }
                offset += 1;
            }

            return source.substring(start, offset);
        }

        private String parseString() {
            expect('"');
            StringBuilder value = new StringBuilder();
            while (offset < source.length()) {
                char character = source.charAt(offset++);
                if (character == '"') {
                    return value.toString();
                }

                if (character != '\\') {
                    value.append(character);
                    continue;
                }

                if (offset >= source.length()) {
                    throw new IllegalArgumentException("Invalid escape sequence");
                }

                char escaped = source.charAt(offset++);
                switch (escaped) {
                    case '"', '\\', '/' -> value.append(escaped);
                    case 'b' -> value.append('\b');
                    case 'f' -> value.append('\f');
                    case 'n' -> value.append('\n');
                    case 'r' -> value.append('\r');
                    case 't' -> value.append('\t');
                    case 'u' -> value.append(parseUnicode());
                    default -> throw new IllegalArgumentException("Invalid escape sequence");
                }
            }

            throw new IllegalArgumentException("Unclosed string");
        }

        private char parseUnicode() {
            if (offset + 4 > source.length()) {
                throw new IllegalArgumentException("Invalid unicode escape");
            }

            String hex = source.substring(offset, offset + 4);
            offset += 4;
            return (char) Integer.parseInt(hex, 16);
        }

        private void skipWhitespace() {
            while (offset < source.length() && Character.isWhitespace(source.charAt(offset))) {
                offset += 1;
            }
        }

        private boolean peek(char expected) {
            return offset < source.length() && source.charAt(offset) == expected;
        }

        private void expect(char expected) {
            if (!peek(expected)) {
                throw new IllegalArgumentException("Expected " + expected);
            }
            offset += 1;
        }

        private void ensureEnd() {
            skipWhitespace();
            if (offset != source.length()) {
                throw new IllegalArgumentException("Unexpected trailing data");
            }
        }
    }
}
