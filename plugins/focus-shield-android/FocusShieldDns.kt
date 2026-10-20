package com.djgaming1t.myelin.focusshield

import java.io.ByteArrayOutputStream
import java.util.Locale

/** DNS wire codec. No Android dependencies; exercised by JVM packet tests. */
object FocusShieldDns {
  data class Rule(val domain: String, val subdomains: Boolean)
  data class Question(val host: String, val type: Int, val klass: Int, val end: Int)
  data class Packet(val bytes: ByteArray, val header: Int, val protocol: Int, val sourcePort: Int) {
    val bodyOffset: Int get() = header + if (protocol == 17) 8 else ((bytes[header + 12].toInt() ushr 4) and 15) * 4
    val body: ByteArray get() = bytes.copyOfRange(bodyOffset, bytes.size)
  }
  fun u16(b: ByteArray, i: Int): Int = ((b[i].toInt() and 255) shl 8) or (b[i + 1].toInt() and 255)
  fun put16(b: ByteArray, i: Int, n: Int) { b[i] = (n ushr 8).toByte(); b[i + 1] = n.toByte() }
  fun u32(b: ByteArray, i: Int): Long = (0..3).fold(0L) { n, k -> (n shl 8) or (b[i + k].toLong() and 255) }
  fun put32(b: ByteArray, i: Int, n: Long) { for (k in 0..3) b[i + k] = (n ushr (24 - k * 8)).toByte() }

  fun normalizeDomain(raw: String): String? {
    val host = raw.trim().trimEnd('.').lowercase(Locale.ROOT)
    if (host.length !in 3..253 || '.' !in host || host.all { it.isDigit() || it == '.' }) return null
    if (host.split('.').any { it.length !in 1..63 || it.first() == '-' || it.last() == '-' || !it.all { c -> c in 'a'..'z' || c in '0'..'9' || c == '-' } }) return null
    return host
  }
  fun blocked(host: String, rules: List<Rule>): Boolean {
    val candidate = host.trimEnd('.').lowercase(Locale.ROOT)
    return rules.any { candidate == it.domain || (it.subdomains && candidate.endsWith(".${it.domain}")) }
  }

  // A single uncompressed question is required. Standard resolver queries use this format.
  // Reject compression/extra questions rather than following attacker-controlled pointer chains.
  fun question(dns: ByteArray, response: Boolean = false): Question? {
    if (dns.size < 17 || u16(dns, 4) != 1 || (dns[2].toInt() and 0x78) != 0) return null
    if (((dns[2].toInt() and 0x80) != 0) != response) return null
    var p = 12
    val labels = mutableListOf<String>()
    while (p < dns.size) {
      val size = dns[p++].toInt() and 255
      if (size == 0) break
      if (size > 63 || p + size > dns.size || labels.size >= 127) return null
      val label = dns.copyOfRange(p, p + size)
      if (label.any { (it.toInt() and 255) !in 33..126 || it == '.'.code.toByte() }) return null
      labels.add(String(label, Charsets.US_ASCII)); p += size
    }
    if (p + 4 > dns.size || labels.isEmpty()) return null
    val host = labels.joinToString(".").lowercase(Locale.ROOT)
    if (host.length > 253) return null
    return Question(host, u16(dns, p), u16(dns, p + 2), p + 4)
  }
  fun error(query: ByteArray, rcode: Int, truncated: Boolean = false): ByteArray {
    val q = question(query)
    val answer = query.copyOf(q?.end ?: 12)
    answer[2] = (0x80 or (query[2].toInt() and 1) or if (truncated) 2 else 0).toByte()
    answer[3] = (0x80 or (rcode and 15)).toByte() // recursion available; never claim DNSSEC validation
    put16(answer, 4, if (q == null) 0 else 1)
    for (i in 6..11) answer[i] = 0
    return answer
  }
  fun validAnswer(query: ByteArray, answer: ByteArray): Boolean {
    val q = question(query) ?: return false
    val a = question(answer, true) ?: return false
    return u16(query, 0) == u16(answer, 0) && q.host == a.host && q.type == a.type && q.klass == a.klass
  }
  fun parsePacket(raw: ByteArray, length: Int): Packet? {
    if (length < 28 || length > raw.size || (raw[0].toInt() ushr 4 and 15) != 4) return null
    val header = (raw[0].toInt() and 15) * 4
    val total = u16(raw, 2)
    if (header < 20 || total > length || total < header + 8 || (u16(raw, 6) and 0x3fff) != 0) return null
    // Only the synthetic DNS endpoint is routed into this tunnel.
    if (!raw.copyOfRange(16, 20).contentEquals(byteArrayOf(10, 111, 222.toByte(), 1))) return null
    val protocol = raw[9].toInt() and 255
    if (protocol != 17 && protocol != 6 || u16(raw, header + 2) != 53) return null
    if (protocol == 17 && (u16(raw, header + 4) != total - header || total < header + 20)) return null
    if (protocol == 6) {
      if (total < header + 20) return null
      val tcpHeader = (raw[header + 12].toInt() ushr 4 and 15) * 4
      if (tcpHeader < 20 || header + tcpHeader > total) return null
    }
    return Packet(raw.copyOf(total), header, protocol, u16(raw, header))
  }
  fun checksum(b: ByteArray): Int {
    var sum = 0L
    var p = 0
    while (p < b.size) { sum += (b[p].toInt() and 255) * 256 + if (p + 1 < b.size) b[p + 1].toInt() and 255 else 0; p += 2 }
    while (sum ushr 16 != 0L) sum = (sum and 65535) + (sum ushr 16)
    return sum.toInt().inv() and 65535
  }
  fun reply(packet: Packet, payload: ByteArray, seq: Long = 0, ack: Long = 0, flags: Int = 0): ByteArray {
    val transport = if (packet.protocol == 17) 8 else 20
    val result = ByteArray(20 + transport + payload.size)
    result[0] = 0x45; put16(result, 2, result.size); result[8] = 64; result[9] = packet.protocol.toByte()
    packet.bytes.copyInto(result, 12, 16, 20); packet.bytes.copyInto(result, 16, 12, 16)
    put16(result, 10, checksum(result.copyOf(20)))
    put16(result, 20, 53); put16(result, 22, packet.sourcePort)
    if (packet.protocol == 17) put16(result, 24, transport + payload.size)
    else {
      put32(result, 24, seq); put32(result, 28, ack); result[32] = 0x50
      result[33] = flags.toByte(); put16(result, 34, 8192)
    }
    payload.copyInto(result, 20 + transport)
    val pseudo = ByteArray(12 + transport + payload.size)
    result.copyInto(pseudo, 0, 12, 20); pseudo[9] = packet.protocol.toByte(); put16(pseudo, 10, transport + payload.size)
    result.copyInto(pseudo, 12, 20)
    put16(result, if (packet.protocol == 17) 26 else 36, checksum(pseudo).let { if (it == 0) 65535 else it })
    return result
  }
}

/** Bounded DNS-over-TCP endpoint. One framed query per connection, then graceful FIN.
 * Stop-and-wait response segments respect the minimum IPv4 MSS (536 bytes).
 * Duplicate segments are ACKed; unacknowledged replies are retried and expire.
 */
class FocusShieldDnsTcp(private val send: (ByteArray) -> Unit, private val resolve: (ByteArray, (ByteArray) -> Unit) -> Unit) {
  private data class Connection(val packet: FocusShieldDns.Packet, var received: Long, var sent: Long,
    val input: ByteArrayOutputStream = ByteArrayOutputStream(), var pending: ByteArray? = null,
    var pendingEnd: Long = 0, var response: ByteArray? = null, var offset: Int = 0,
    var resolving: Boolean = false, var finished: Boolean = false, var last: Long = 0, var retries: Int = 0)
  private val connections = linkedMapOf<String, Connection>()
  private fun key(p: FocusShieldDns.Packet) = p.bytes.copyOfRange(12, 16).joinToString(".") + ":" + p.sourcePort
  private fun next(n: Long, count: Int) = (n + count) and 0xffffffffL
  @Synchronized fun accept(p: FocusShieldDns.Packet, now: Long) {
    val key = key(p); val flags = p.bytes[p.header + 13].toInt() and 255
    val seq = FocusShieldDns.u32(p.bytes, p.header + 4); val ack = FocusShieldDns.u32(p.bytes, p.header + 8)
    if (flags and 4 != 0) { connections.remove(key); return }
    var c = connections[key]
    if (flags and 2 != 0) {
      if (c != null) { c.pending?.let(send); return }
      if (connections.size >= 32) return
      c = Connection(p, next(seq, 1), java.security.SecureRandom().nextInt().toLong() and 0xffffffffL, last = now)
      connections[key] = c; emit(c, byteArrayOf(), 0x12, now); return
    }
    if (c == null) return
    if (flags and 16 != 0 && c.pending != null && ack == c.pendingEnd) {
      c.pending = null; c.sent = ack; c.retries = 0
      if (c.finished) { connections.remove(key); return }
      pump(c, now)
    }
    val body = p.body
    if (body.isNotEmpty()) {
      if (seq == c.received && !c.resolving && c.input.size() + body.size <= 4098) {
        c.input.write(body); c.received = next(seq, body.size); c.last = now
        val bytes = c.input.toByteArray()
        if (bytes.size >= 2) {
          val length = FocusShieldDns.u16(bytes, 0)
          if (length !in 12..4096) { connections.remove(key); send(FocusShieldDns.reply(p, byteArrayOf(), c.sent, c.received, 0x14)); return }
          if (bytes.size >= length + 2) {
            c.resolving = true
            val current = c
            resolve(bytes.copyOfRange(2, length + 2)) { answer ->
              synchronized(this) {
                if (connections[key] !== current) return@synchronized
                val framed = ByteArray(answer.size + 2); FocusShieldDns.put16(framed, 0, answer.size); answer.copyInto(framed, 2)
                current.response = framed; pump(current, System.nanoTime() / 1_000_000)
              }
            }
          }
        }
      }
      send(FocusShieldDns.reply(p, byteArrayOf(), c.sent, c.received, 0x10))
    }
    if (flags and 1 != 0 && seq + body.size == c.received) {
      c.received = next(c.received, 1); send(FocusShieldDns.reply(p, byteArrayOf(), c.sent, c.received, 0x10))
    }
  }
  private fun emit(c: Connection, body: ByteArray, flags: Int, now: Long) {
    val packet = FocusShieldDns.reply(c.packet, body, c.sent, c.received, flags)
    c.pendingEnd = next(c.sent, body.size + if (flags and 3 != 0) 1 else 0)
    c.pending = packet; c.last = now; send(packet)
  }
  private fun pump(c: Connection, now: Long) {
    val response = c.response ?: return
    if (c.pending != null) return
    if (c.offset < response.size) {
      val end = (c.offset + 536).coerceAtMost(response.size)
      val body = response.copyOfRange(c.offset, end); c.offset = end; emit(c, body, 0x18, now)
    } else { c.finished = true; emit(c, byteArrayOf(), 0x11, now) }
  }
  @Synchronized fun tick(now: Long) {
    val iterator = connections.iterator()
    while (iterator.hasNext()) {
      val c = iterator.next().value
      if (now - c.last > 10_000 || c.retries >= 3) iterator.remove()
      else if (c.pending != null && now - c.last >= 1_000) { send(c.pending!!); c.last = now; c.retries++ }
    }
  }
  @Synchronized fun clear() { connections.clear() }
}
