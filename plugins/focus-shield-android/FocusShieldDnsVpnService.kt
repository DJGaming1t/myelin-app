package com.djgaming1t.myelin.focusshield

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class FocusShieldDnsVpnService : VpnService() {
  companion object {
    const val ACTION_START_OR_SYNC = "com.djgaming1t.myelin.focusshield.VPN_START_OR_SYNC"
    const val ACTION_STOP = "com.djgaming1t.myelin.focusshield.VPN_STOP"
    const val VPN_NOTIFICATION_ID = 4110
    const val ALERT_NOTIFICATION_ID = 4111
    const val ALERT_CHANNEL_ID = "myelin_focus_shield_dns_alert"

    const val VIRTUAL_IPV4_CLIENT = "10.215.173.1"
    const val VIRTUAL_IPV4_DNS = "10.215.173.2"
    const val VIRTUAL_IPV6_CLIENT = "fd00:215:173::1"
    const val VIRTUAL_IPV6_DNS = "fd00:215:173::2"

    private val FALLBACK_UPSTREAM_DNS = listOf("1.1.1.1", "8.8.8.8", "9.9.9.9")

    @Volatile
    var isRunning: Boolean = false
      private set

    fun isOtherVpnActive(context: Context): Boolean {
      if (isRunning) return false
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
      return try {
        cm.allNetworks.any { net ->
          val caps = cm.getNetworkCapabilities(net)
          caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        }
      } catch (_: Exception) {
        false
      }
    }
  }

  private val runningLoop = AtomicBoolean(false)
  private var tunInterface: ParcelFileDescriptor? = null
  private var readerThread: Thread? = null
  private var dnsPool: ExecutorService? = null
  private val tunWriteLock = Any()
  private val lastLoggedDomainAtMs = ConcurrentHashMap<String, Long>()

  override fun onCreate() {
    super.onCreate()
    createAlertNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopVpnTunnel()
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }

    val state = FocusShieldStore.loadState(this)
    val now = System.currentTimeMillis()
    val shouldRun =
      state.isEnforcementActive(now) &&
        state.websiteBlockingEnabled &&
        state.blockedDomains.isNotEmpty() &&
        prepare(this) == null

    if (!shouldRun) {
      stopVpnTunnel()
      stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }

    startVpnForegroundNotification(state)
    ensureVpnTunnelStarted(state)
    return START_STICKY
  }

  override fun onRevoke() {
    FocusShieldStore.appendInterceptEvent(
      context = this,
      packageName = packageName,
      appLabel = "VPN Permission Revoked or Replaced",
      vector = "permission-revoked",
      outcome = "bypassed"
    )
    stopVpnTunnel()
    stopForeground(true)
    stopSelf()
    super.onRevoke()
  }

  private fun startVpnForegroundNotification(state: ShieldSessionState) {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && mgr != null) {
      val ch = NotificationChannel(
        FocusShieldMonitorService.CHANNEL_ID,
        "MYELIN Focus Shield",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        setShowBadge(false)
      }
      mgr.createNotificationChannel(ch)
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, FocusShieldMonitorService.CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val notification = builder
      .setContentTitle("Focus Shield Website Filter · ${state.effectiveTopicName}")
      .setContentText("Guarding ${state.userDomainCount} distracting domains locally on-device")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        VPN_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(VPN_NOTIFICATION_ID, notification)
    }
  }

  private fun createAlertNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      val ch = NotificationChannel(
        ALERT_CHANNEL_ID,
        "MYELIN Blocked Website Alerts",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Notifies when a distracting website is blocked during a MYELIN Focus session."
        setShowBadge(false)
      }
      mgr.createNotificationChannel(ch)
    }
  }

  @Synchronized
  private fun ensureVpnTunnelStarted(state: ShieldSessionState) {
    if (runningLoop.get() && tunInterface != null) {
      return
    }
    stopVpnTunnel()

    val builder = Builder()
      .setSession("MYELIN Focus Shield DNS")
      .setMtu(1500)
      .addAddress(VIRTUAL_IPV4_CLIENT, 30)
      .addDnsServer(VIRTUAL_IPV4_DNS)
      .addRoute(VIRTUAL_IPV4_DNS, 32)

    try {
      builder
        .addAddress(VIRTUAL_IPV6_CLIENT, 126)
        .addDnsServer(VIRTUAL_IPV6_DNS)
        .addRoute(VIRTUAL_IPV6_DNS, 128)
    } catch (_: Exception) {}

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      builder.setMetered(false)
    }

    val excludedPackages = mutableSetOf(packageName).apply {
      addAll(state.allowlistedPackages)
    }
    for (pkg in excludedPackages) {
      try {
        builder.addDisallowedApplication(pkg)
      } catch (_: Exception) {}
    }

    val pfd = try {
      builder.establish()
    } catch (_: Exception) {
      null
    } ?: return

    tunInterface = pfd
    runningLoop.set(true)
    isRunning = true

    val pool = Executors.newFixedThreadPool(8)
    dnsPool = pool

    val thread = Thread({
      runTunPacketLoop(pfd, pool)
    }, "MyelinFocusShieldDnsLoop")
    thread.isDaemon = true
    thread.start()
    readerThread = thread
  }

  private fun runTunPacketLoop(pfd: ParcelFileDescriptor, pool: ExecutorService) {
    val input = FileInputStream(pfd.fileDescriptor)
    val output = FileOutputStream(pfd.fileDescriptor)
    val buffer = ByteArray(32767)

    try {
      while (runningLoop.get()) {
        val readLen = input.read(buffer)
        if (readLen <= 0) continue

        val state = FocusShieldStore.loadState(this)
        val now = System.currentTimeMillis()
        if (!state.isEnforcementActive(now) || !state.websiteBlockingEnabled) {
          break
        }

        val breakPassActive = now < state.breakPassExpiresAtMs
        val activeBlockedDomains = if (breakPassActive) emptySet() else state.blockedDomains
        val activeWildcardDomains = if (breakPassActive) emptySet() else state.wildcardDomains
        val packetCopy = buffer.copyOfRange(0, readLen)

        pool.execute {
          try {
            val responsePacket = FocusShieldDnsPacketEngine.handleTunPacket(
              packet = packetCopy,
              length = readLen,
              blockedDomains = activeBlockedDomains,
              wildcardDomains = activeWildcardDomains,
              blockDohCanary = !breakPassActive && state.blockDohCanary,
              upstreamForwarder = { dnsQuery ->
                forwardDnsQueryUpstream(dnsQuery)
              },
              onDomainBlocked = { matchedDomain ->
                recordBlockedDomainAttempt(state, matchedDomain)
              }
            )
            if (responsePacket != null && runningLoop.get()) {
              synchronized(tunWriteLock) {
                output.write(responsePacket)
                output.flush()
              }
            }
          } catch (_: Exception) {}
        }
      }
    } catch (_: Exception) {
    } finally {
      isRunning = false
      runningLoop.set(false)
    }
  }

  private fun forwardDnsQueryUpstream(dnsQuery: ByteArray): ByteArray? {
    val upstreams = resolveUpstreamDnsServers()
    for (serverIp in upstreams) {
      var socket: DatagramSocket? = null
      try {
        val addr = InetAddress.getByName(serverIp)
        socket = DatagramSocket()
        if (!protect(socket)) {
          socket.close()
          continue
        }
        socket.soTimeout = 2200
        val outPacket = DatagramPacket(dnsQuery, dnsQuery.size, addr, 53)
        socket.send(outPacket)

        val respBuf = ByteArray(1450)
        val inPacket = DatagramPacket(respBuf, respBuf.size)
        socket.receive(inPacket)
        if (inPacket.length >= 12) {
          return respBuf.copyOfRange(0, inPacket.length)
        }
      } catch (_: Exception) {
      } finally {
        try {
          socket?.close()
        } catch (_: Exception) {}
      }
    }
    return null
  }

  private fun resolveUpstreamDnsServers(): List<String> {
    val result = mutableListOf<String>()
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    if (cm != null) {
      try {
        for (net in cm.allNetworks) {
          val caps = cm.getNetworkCapabilities(net) ?: continue
          if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
          if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
          val props = cm.getLinkProperties(net) ?: continue
          for (dnsAddr in props.dnsServers) {
            val hostAddr = dnsAddr.hostAddress ?: continue
            if (hostAddr != VIRTUAL_IPV4_DNS && hostAddr != VIRTUAL_IPV6_DNS && !hostAddr.startsWith("fe80:")) {
              if (hostAddr !in result) {
                result.add(hostAddr)
              }
            }
          }
        }
      } catch (_: Exception) {}
    }
    for (fallback in FALLBACK_UPSTREAM_DNS) {
      if (fallback !in result) {
        result.add(fallback)
      }
    }
    return result
  }

  private fun recordBlockedDomainAttempt(state: ShieldSessionState, matchedDomain: String) {
    val canonical = FocusShieldStore.canonicalDisplayDomain(matchedDomain)
    val now = System.currentTimeMillis()
    val prev = lastLoggedDomainAtMs[canonical] ?: 0L
    if (now - prev < 15_000L) return
    lastLoggedDomainAtMs[canonical] = now

    FocusShieldStore.recordInterceptionAttempt(this)
    FocusShieldStore.appendInterceptEvent(
      context = this,
      packageName = "domain:$canonical",
      appLabel = canonical,
      vector = "blocked-website",
      outcome = "returned",
      parkedThought = null
    )

    postBlockedDomainHeadsUpNotification(state, canonical)
  }

  private fun postBlockedDomainHeadsUpNotification(state: ShieldSessionState, domain: String) {
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pendingIntent = PendingIntent.getActivity(
      this,
      1,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, ALERT_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val notification = builder
      .setContentTitle("$domain is paused during Focus")
      .setContentText("Active block: ${state.effectiveTopicName} · Tap to return to MYELIN or park this thought")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()

    try {
      mgr.notify(ALERT_NOTIFICATION_ID, notification)
    } catch (_: Exception) {}
  }

  @Synchronized
  private fun stopVpnTunnel() {
    runningLoop.set(false)
    isRunning = false
    try {
      tunInterface?.close()
    } catch (_: Exception) {}
    tunInterface = null
    try {
      readerThread?.interrupt()
    } catch (_: Exception) {}
    readerThread = null
    try {
      dnsPool?.shutdownNow()
    } catch (_: Exception) {}
    dnsPool = null
  }

  override fun onDestroy() {
    stopVpnTunnel()
    super.onDestroy()
  }
}
