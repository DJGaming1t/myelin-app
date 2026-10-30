package com.djgaming1t.myelin.focusshield

fun main() {
  fun matches(address: String, subdomains: Boolean = true): Boolean {
    val host = FocusShieldBrowserAddress.host(address) ?: return false
    return FocusShieldDns.blocked(host, listOf(FocusShieldDns.Rule("youtube.com", subdomains)))
  }
  check(matches("https://www.youtube.com/watch?v=private"))
  check(matches("youtube.com:443/watch?v=123"))
  check(matches("HTTPS://YouTube.com"))
  check(!matches("https://youtube.com.evil.test/"))
  check(!matches("https://youtube.com@evil.test/"))
  check(!matches("https://allowed.test/?q=youtube.com"))
  check(!matches("www.youtube.com", subdomains = false))
  check(!matches("javascript://youtube.com"))
  check(!matches("youtube.com with spaces"))
  check(!matches("127.0.0.1"))
  println("Browser address matching: exact hosts, subdomains, URL parsing and spoofing cases passed.")
}
