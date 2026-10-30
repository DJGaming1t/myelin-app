package com.djgaming1t.myelin.focusshield

import java.net.URI
import java.util.Locale

/** Only the host is returned; paths, query strings and page content stay transient. */
object FocusShieldBrowserAddress {
  fun host(address: String): String? {
    val value = address.trim()
    if (value.isBlank() || value.any { it.isWhitespace() }) return null
    val uri = try { URI(if (value.contains("://")) value else "https://$value") } catch (_: Exception) { return null }
    if (uri.scheme?.lowercase(Locale.ROOT) !in setOf("http", "https")) return null
    return FocusShieldDns.normalizeDomain(uri.host ?: return null)
  }
}
