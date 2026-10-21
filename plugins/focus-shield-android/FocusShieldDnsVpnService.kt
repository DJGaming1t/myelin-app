package com.djgaming1t.myelin.focusshield

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Socket
import java.net.InetSocketAddress
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Only the synthetic DNS /32 is routed here. HTTPS, calls and ordinary IPv4/IPv6 bypass it. */
class FocusShieldDnsVpnService : VpnService() {
  companion object {
    @Volatile var isRunning = false; private set
    @Volatile var lastError = ""; private set
    const val ACTION_STOP = "com.djgaming1t.myelin.focusshield.VPN_STOP"
    fun isOtherVpnActive(context: Context): Boolean {
      if (isRunning) return false
      val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
      return cm.allNetworks.any { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true }
    }
    fun privateDnsActive(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < 28) return false
      val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
      return cm.allNetworks.any { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == false && cm.getLinkProperties(it)?.isPrivateDnsActive == true }
    }
  }
  private val handler = Handler(Looper.getMainLooper())
  private val writeLock = Any()
  @Volatile private var stopped = false
  @Volatile private var generation = 0L
  @Volatile private var tunnel: ParcelFileDescriptor? = null
  private var reader: Thread? = null
  private var output: FileOutputStream? = null
  private var pool: ThreadPoolExecutor? = null
  private var registered = false
  private var excluded: Set<String> = emptySet()
  private val logged = linkedMapOf<String, Long>()
  private val cm by lazy { getSystemService(ConnectivityManager::class.java) }
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { updateUnderlying() }
    override fun onLost(network: Network) { updateUnderlying() }
  }
  private val tcp = FocusShieldDnsTcp({ bytes -> writePacket(bytes) }) { query, complete -> submit(query, complete) }
  private val expiry = object : Runnable {
    override fun run() {
      if (stopped) return
      val state = FocusShieldStore.loadState(this@FocusShieldDnsVpnService)
      if (!state.isEnforcementActive() || !state.websiteBlockingEnabled || state.blockedDomains.isEmpty()) { stopSelf(); return }
      tcp.tick(System.nanoTime() / 1_000_000)
      handler.postDelayed(this, 1000)
    }
  }
  private fun networks(): List<Network> = cm?.allNetworks?.filter {
    val c = cm?.getNetworkCapabilities(it)
    c?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == false && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  } ?: emptyList()
  private fun updateUnderlying() { if (!stopped) try { setUnderlyingNetworks(networks().toTypedArray()) } catch (_: Exception) {} }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val state = FocusShieldStore.loadState(this)
    if (intent?.action == ACTION_STOP || !state.isEnforcementActive() || !state.websiteBlockingEnabled ||
        state.blockedDomains.isEmpty() || prepare(this) != null) { stopSelf(); return START_NOT_STICKY }
    try {
      foreground(state)
      if (tunnel != null && excluded != state.allowlistedPackages) closeTunnel()
      if (tunnel == null) startTunnel(state)
      handler.removeCallbacks(expiry); handler.post(expiry)
    } catch (_: Exception) { lastError = "Website VPN could not start. Check VPN permission and try again."; stopSelf() }
    return START_NOT_STICKY
  }
  private fun foreground(state: ShieldSessionState) {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = "myelin_focus_dns"
    manager.createNotificationChannel(NotificationChannel(channel, "Focus Shield website filter", NotificationManager.IMPORTANCE_LOW))
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val pending = PendingIntent.getActivity(this, 4110, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = Notification.Builder(this, channel).setSmallIcon(applicationInfo.icon)
      .setContentTitle("Focus Shield website filter")
      .setContentText("${state.userDomainCount} domain rules · ${state.effectiveTopicName}")
      .setContentIntent(pending).setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(4110, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(4110, notification)
  }
  private fun startTunnel(state: ShieldSessionState) {
    stopped = false
    val builder = Builder().setSession("MYELIN website filter").setMtu(32767)
      .addAddress("10.111.222.2", 32).addDnsServer("10.111.222.1").addRoute("10.111.222.1", 32)
      .allowFamily(OsConstants.AF_INET6).setBlocking(false)
    // Study and essential apps bypass DNS filtering as well as app interception.
    excluded = state.allowlistedPackages
    for (pkg in excluded + packageName) try { builder.addDisallowedApplication(pkg) } catch (_: android.content.pm.PackageManager.NameNotFoundException) {}
    if (Build.VERSION.SDK_INT >= 29) builder.setMetered(false)
    val fd = builder.establish() ?: throw IllegalStateException("VPN permission revoked")
    tunnel = fd; output = FileOutputStream(fd.fileDescriptor)
    pool = ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, ArrayBlockingQueue(32))
    isRunning = true; lastError = ""
    if (!registered) {
      cm?.registerNetworkCallback(NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), callback)
      registered = true
    }
    updateUnderlying()
    reader = Thread({ readPackets(fd) }, "MyelinDnsTun").apply { isDaemon = true; start() }
  }
  private fun readPackets(fd: ParcelFileDescriptor) {
    val input = FileInputStream(fd.fileDescriptor)
    val poll = StructPollfd().apply { this.fd = fd.fileDescriptor; events = OsConstants.POLLIN.toShort() }
    val bytes = ByteArray(32767)
    try {
      while (!stopped && tunnel === fd) {
        val packetGeneration = generation
        if (Os.poll(arrayOf(poll), 1000) <= 0) continue
        if (poll.revents.toInt() and (OsConstants.POLLERR or OsConstants.POLLHUP or OsConstants.POLLNVAL) != 0) break
        val length = try { input.read(bytes) } catch (e: java.io.IOException) { if (!stopped) throw e else break }
        if (stopped || tunnel !== fd || packetGeneration != generation) break
        if (length <= 0) continue
        val packet = FocusShieldDns.parsePacket(bytes, length) ?: continue
        if (packet.protocol == 6) tcp.accept(packet, System.nanoTime() / 1_000_000)
        else submit(packet.body) { answer -> writePacket(FocusShieldDns.reply(packet, if (answer.size > 1232) FocusShieldDns.error(packet.body, 0, truncated = true) else answer), packetGeneration) }
      }
    } catch (_: Exception) { if (!stopped) lastError = "Website VPN stopped after a tunnel error. Reopen Focus to retry." }
    finally { if (!stopped && tunnel === fd) handler.post { stopSelf() } }
  }
  private fun submit(query: ByteArray, complete: (ByteArray) -> Unit) {
    if (stopped || FocusShieldDns.question(query) == null) return
    val requestGeneration = generation
    // Capture identity before queueing: an old queued query must not count against a new owner/window.
    val start = FocusShieldStore.loadState(this)
    try { pool?.execute {
      if (stopped || requestGeneration != generation || !FocusShieldStore.loadState(this).sameIdentity(start)) return@execute
      var answer = resolve(query, start)
      // Do not deliver results from an old owner/session or bypass newly activated rules.
      val live = FocusShieldStore.loadState(this)
      if (stopped || requestGeneration != generation || !live.sameIdentity(start) || !live.isEnforcementActive()) return@execute
      if (isBlocked(query, live)) answer = FocusShieldDns.error(query, 3)
      complete(answer)
    } } catch (_: java.util.concurrent.RejectedExecutionException) { complete(FocusShieldDns.error(query, 2)) }
  }
  private fun isBlocked(query: ByteArray, state: ShieldSessionState): Boolean {
    if (System.currentTimeMillis() < state.breakPassExpiresAtMs) return false
    val host = FocusShieldDns.question(query)?.host ?: return false
    // Firefox's opt-out canary is voluntary. Never claim it defeats explicit browser DoH.
    return (state.blockDohCanary && host == "use-application-dns.net") ||
      FocusShieldDns.blocked(host, state.blockedDomains.map { FocusShieldDns.Rule(it, it in state.wildcardDomains) })
  }
  private fun resolve(query: ByteArray, state: ShieldSessionState): ByteArray {
    if (!state.isEnforcementActive()) return FocusShieldDns.error(query, 2)
    if (isBlocked(query, state)) {
      val host = FocusShieldDns.question(query)!!.host
      if (host != "use-application-dns.net") synchronized(logged) {
        val now = System.currentTimeMillis()
        val key = "${state.ownerKey}:${state.sessionId}:${state.enforcementRunKey}:$host"
        val previous = logged[key] ?: 0
        if (now - previous > 15_000) {
          if (logged.size >= 160) logged.remove(logged.keys.first())
          // Count and log together under the store's owner/session/window guard.
          if (FocusShieldStore.recordDomainInterception(this, state, host)) logged[key] = now
        }
      }
      return FocusShieldDns.error(query, 3)
    }
    // Use the network's resolver; do not silently send browsing queries to a new third party.
    for (network in networks().take(2)) {
      for (server in (cm?.getLinkProperties(network)?.dnsServers ?: emptyList()).take(2)) {
        try {
          DatagramSocket().use { socket ->
            if (!protect(socket)) throw java.io.IOException("Unprotected DNS socket")
            network.bindSocket(socket); socket.soTimeout = 1500; socket.connect(server, 53)
            socket.send(DatagramPacket(query, query.size))
            val response = DatagramPacket(ByteArray(32700), 32700); socket.receive(response)
            val answer = response.data.copyOf(response.length)
            if (!FocusShieldDns.validAnswer(query, answer)) throw java.io.IOException("Mismatched DNS answer")
            if (answer[2].toInt() and 2 == 0) return answer
          }
          Socket().use { socket ->
            if (!protect(socket)) throw java.io.IOException("Unprotected DNS TCP socket")
            network.bindSocket(socket); socket.soTimeout = 1500; socket.connect(InetSocketAddress(server, 53), 1500)
            DataOutputStream(socket.getOutputStream()).apply { writeShort(query.size); write(query); flush() }
            val input = DataInputStream(socket.getInputStream()); val size = input.readUnsignedShort()
            if (size !in 12..32700) throw java.io.IOException("DNS answer too large")
            val answer = ByteArray(size); input.readFully(answer)
            if (FocusShieldDns.validAnswer(query, answer)) return answer
          }
        } catch (_: Exception) { /* Retry a resolver on the available underlying network. */ }
      }
    }
    return FocusShieldDns.error(query, 2)
  }
  private fun writePacket(bytes: ByteArray, expectedGeneration: Long = generation) {
    synchronized(writeLock) { if (!stopped && expectedGeneration == generation) try { output?.write(bytes) } catch (_: Exception) { handler.post { stopSelf() } } }
  }
  private fun closeTunnel() {
    stopped = true; generation++; isRunning = false; tcp.clear()
    synchronized(writeLock) { try { tunnel?.close() } catch (_: Exception) {}; tunnel = null; output = null }
    reader?.interrupt(); reader = null; pool?.shutdownNow(); pool = null
    if (registered) try { cm?.unregisterNetworkCallback(callback) } catch (_: Exception) {}
    registered = false
  }
  override fun onRevoke() {
    lastError = "VPN permission was revoked or another VPN replaced MYELIN."
    handler.post { closeTunnel(); stopSelf() }
    super.onRevoke()
  }
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null); closeTunnel(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy()
  }
}
