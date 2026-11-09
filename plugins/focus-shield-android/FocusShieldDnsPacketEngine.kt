package com.djgaming1t.myelin.focusshield

import java.io.ByteArrayOutputStream
import java.util.Locale

data class DnsQuestionParsed(
  val txId: Int,
  val flags: Int,
  val qname: String,
  val qtype: Int,
  val qclass: Int,
  val questionEndOffset: Int
)

object FocusShieldDnsPacketEngine {
  private const val IPV4_VERSION = 4
  private const val IPV6_VERSION = 6
  private const val PROTO_TCP = 6
  private const val PROTO_UDP = 17
  private const val DNS_PORT = 53

  // Browsers query these canary / bootstrap domains over system DNS before enabling DoH.
  // Returning NXDOMAIN for use-application-dns.net instructs Firefox/Gecko browsers to fall back to system DNS.
  val DOH_CANARY_AND_BOOTSTRAP_DOMAINS = setOf(
    "use-application-dns.net",
    "_dns.resolver.arpa",
    "dns.google",
    "cloudflare-dns.com",
    "mozilla.cloudflare-dns.com",
    "security.cloudflare-dns.com",
    "family.cloudflare-dns.com",
    "dns.quad9.net",
    "doh.opendns.com",
    "dns.adguard-dns.com",
    "doh.cleanbrowsing.org"
  )

  fun handleTunPacket(
    packet: ByteArray,
    length: Int,
    blockedDomains: Set<String>,
    wildcardDomains: Set<String>,
    blockDohCanary: Boolean,
    upstreamForwarder: (ByteArray) -> ByteArray?,
    onDomainBlocked: (String) -> Unit
  ): ByteArray? {
    if (length < 20 || length > packet.size) return null
    val version = (packet[0].toInt() ushr 4) and 0x0F
    return when (version) {
      IPV4_VERSION -> handleIpv4Packet(
        packet = packet,
        length = length,
        blockedDomains = blockedDomains,
        wildcardDomains = wildcardDomains,
        blockDohCanary = blockDohCanary,
        upstreamForwarder = upstreamForwarder,
        onDomainBlocked = onDomainBlocked
      )
      IPV6_VERSION -> handleIpv6Packet(
        packet = packet,
        length = length,
        blockedDomains = blockedDomains,
        wildcardDomains = wildcardDomains,
        blockDohCanary = blockDohCanary,
        upstreamForwarder = upstreamForwarder,
        onDomainBlocked = onDomainBlocked
      )
      else -> null
    }
  }

  private fun handleIpv4Packet(
    packet: ByteArray,
    length: Int,
    blockedDomains: Set<String>,
    wildcardDomains: Set<String>,
    blockDohCanary: Boolean,
    upstreamForwarder: (ByteArray) -> ByteArray?,
    onDomainBlocked: (String) -> Unit
  ): ByteArray? {
    val ihl = (packet[0].toInt() and 0x0F) * 4
    if (ihl < 20 || length < ihl + 8) return null
    val totalLen = readU16(packet, 2).coerceAtMost(length)
    if (totalLen < ihl + 8) return null

    val protocol = packet[9].toInt() and 0xFF
    val srcIp = packet.copyOfRange(12, 16)
    val dstIp = packet.copyOfRange(16, 20)

    if (protocol == PROTO_TCP) {
      if (totalLen < ihl + 20) return null
      val dstPort = readU16(packet, ihl + 2)
      if (dstPort == DNS_PORT) {
        return buildIpv4TcpRstPacket(packet, ihl, srcIp, dstIp)
      }
      return null
    }

    if (protocol != PROTO_UDP) return null

    val srcPort = readU16(packet, ihl)
    val dstPort = readU16(packet, ihl + 2)
    val udpLen = readU16(packet, ihl + 4)
    if (dstPort != DNS_PORT || udpLen < 8) return null

    val dnsStart = ihl + 8
    val dnsLen = (udpLen - 8).coerceAtMost(totalLen - dnsStart)
    if (dnsLen < 12) return null

    val dnsPayload = packet.copyOfRange(dnsStart, dnsStart + dnsLen)
    val dnsReply = processDnsQueryPayload(
      dnsPayload = dnsPayload,
      blockedDomains = blockedDomains,
      wildcardDomains = wildcardDomains,
      blockDohCanary = blockDohCanary,
      upstreamForwarder = upstreamForwarder,
      onDomainBlocked = onDomainBlocked
    ) ?: return null

    return buildIpv4UdpPacket(
      srcIp = dstIp,
      dstIp = srcIp,
      srcPort = dstPort,
      dstPort = srcPort,
      payload = dnsReply
    )
  }

  private fun handleIpv6Packet(
    packet: ByteArray,
    length: Int,
    blockedDomains: Set<String>,
    wildcardDomains: Set<String>,
    blockDohCanary: Boolean,
    upstreamForwarder: (ByteArray) -> ByteArray?,
    onDomainBlocked: (String) -> Unit
  ): ByteArray? {
    val ipv6HeaderLen = 40
    if (length < ipv6HeaderLen + 8) return null
    val payloadLen = readU16(packet, 4)
    val totalLen = (ipv6HeaderLen + payloadLen).coerceAtMost(length)
    val nextHeader = packet[6].toInt() and 0xFF
    val srcIp = packet.copyOfRange(8, 24)
    val dstIp = packet.copyOfRange(24, 40)

    if (nextHeader == PROTO_TCP) {
      if (totalLen < ipv6HeaderLen + 20) return null
      val dstPort = readU16(packet, ipv6HeaderLen + 2)
      if (dstPort == DNS_PORT) {
        return buildIpv6TcpRstPacket(packet, ipv6HeaderLen, srcIp, dstIp)
      }
      return null
    }

    if (nextHeader != PROTO_UDP) return null

    val srcPort = readU16(packet, ipv6HeaderLen)
    val dstPort = readU16(packet, ipv6HeaderLen + 2)
    val udpLen = readU16(packet, ipv6HeaderLen + 4)
    if (dstPort != DNS_PORT || udpLen < 8) return null

    val dnsStart = ipv6HeaderLen + 8
    val dnsLen = (udpLen - 8).coerceAtMost(totalLen - dnsStart)
    if (dnsLen < 12) return null

    val dnsPayload = packet.copyOfRange(dnsStart, dnsStart + dnsLen)
    val dnsReply = processDnsQueryPayload(
      dnsPayload = dnsPayload,
      blockedDomains = blockedDomains,
      wildcardDomains = wildcardDomains,
      blockDohCanary = blockDohCanary,
      upstreamForwarder = upstreamForwarder,
      onDomainBlocked = onDomainBlocked
    ) ?: return null

    return buildIpv6UdpPacket(
      srcIp = dstIp,
      dstIp = srcIp,
      srcPort = dstPort,
      dstPort = srcPort,
      payload = dnsReply
    )
  }

  fun processDnsQueryPayload(
    dnsPayload: ByteArray,
    blockedDomains: Set<String>,
    wildcardDomains: Set<String>,
    blockDohCanary: Boolean,
    upstreamForwarder: (ByteArray) -> ByteArray?,
    onDomainBlocked: (String) -> Unit
  ): ByteArray? {
    val parsed = parseDnsQuestion(dnsPayload) ?: return upstreamForwarder(dnsPayload)
    val host = parsed.qname

    // 1. Check DoH canary / bootstrap domains first (silent NXDOMAIN without logging a user distraction)
    if (blockDohCanary && isDohCanaryOrBootstrap(host)) {
      return buildSinkholeNxDomainResponse(dnsPayload, parsed)
    }

    // 2. Check user-configured blocked domains & wildcard subdomains
    val matchedDomain = matchBlockedDomain(host, blockedDomains, wildcardDomains)
    if (matchedDomain != null) {
      onDomainBlocked(matchedDomain)
      return buildSinkholeNxDomainResponse(dnsPayload, parsed)
    }

    // 3. Forward allowed domain query to upstream DNS server
    return upstreamForwarder(dnsPayload)
  }

  fun parseDnsQuestion(dns: ByteArray): DnsQuestionParsed? {
    if (dns.size < 12) return null
    val txId = readU16(dns, 0)
    val flags = readU16(dns, 2)
    // Must be a query (QR bit 15 == 0)
    if ((flags and 0x8000) != 0) return null
    val qdCount = readU16(dns, 4)
    if (qdCount < 1) return null

    val labels = mutableListOf<String>()
    var pos = 12
    var jumped = false
    var questionEnd = -1
    var jumps = 0

    while (pos < dns.size) {
      val len = dns[pos].toInt() and 0xFF
      if (len == 0) {
        if (!jumped) {
          questionEnd = pos + 1
        }
        break
      }
      // RFC 1035 compression pointer (top 2 bits == 11)
      if ((len and 0xC0) == 0xC0) {
        if (pos + 1 >= dns.size) return null
        if (!jumped) {
          questionEnd = pos + 2
          jumped = true
        }
        val ptr = ((len and 0x3F) shl 8) or (dns[pos + 1].toInt() and 0xFF)
        if (ptr < 12 || ptr >= dns.size || ++jumps > 12) return null
        pos = ptr
        continue
      }
      // Standard label (1..63 bytes)
      if ((len and 0xC0) != 0) return null
      val labelStart = pos + 1
      val labelEnd = labelStart + len
      if (labelEnd > dns.size) return null
      val label = String(dns, labelStart, len, Charsets.UTF_8)
      labels.add(label)
      pos = labelEnd
      if (labels.size > 32) return null
    }

    if (questionEnd < 0 || questionEnd + 4 > dns.size) return null
    val qtype = readU16(dns, questionEnd)
    val qclass = readU16(dns, questionEnd + 2)
    val normalizedHost = labels
      .joinToString(".")
      .lowercase(Locale.US)
      .trimEnd('.')

    if (normalizedHost.isEmpty()) return null

    return DnsQuestionParsed(
      txId = txId,
      flags = flags,
      qname = normalizedHost,
      qtype = qtype,
      qclass = qclass,
      questionEndOffset = questionEnd + 4
    )
  }

  fun isDohCanaryOrBootstrap(host: String): Boolean {
    val clean = host.lowercase(Locale.US).trimEnd('.')
    for (canary in DOH_CANARY_AND_BOOTSTRAP_DOMAINS) {
      if (clean == canary || clean.endsWith(".$canary")) return true
    }
    return false
  }

  fun matchBlockedDomain(
    candidateHost: String,
    blockedDomains: Set<String>,
    wildcardDomains: Set<String>
  ): String? {
    val host = candidateHost
      .lowercase(Locale.US)
      .trimEnd('.')
      .removePrefix("www.")
    if (host.isEmpty()) return null

    for (rawRule in blockedDomains) {
      val rule = rawRule.lowercase(Locale.US).trimEnd('.').removePrefix("www.")
      if (rule.isEmpty()) continue
      if (host == rule) return rule
    }

    for (rawRule in wildcardDomains) {
      val rule = rawRule.lowercase(Locale.US).trimEnd('.').removePrefix("www.")
      if (rule.isEmpty()) continue
      if (host == rule || host.endsWith(".$rule")) return rule
    }

    return null
  }

  /**
   * Builds an RFC 1035 / RFC 2308 compliant NXDOMAIN response with a 5-second negative caching SOA record.
   * Keeping the negative TTL at 5 seconds ensures that as soon as the MYELIN Focus session ends (or a break
   * pass starts), browsers can resolve the domain again within 5 seconds without flushing OS DNS caches.
   */
  fun buildSinkholeNxDomainResponse(
    queryPacket: ByteArray,
    parsed: DnsQuestionParsed
  ): ByteArray {
    val out = ByteArrayOutputStream(parsed.questionEndOffset + 64)

    // 1. 12-byte DNS Header
    // Transaction ID
    out.write((parsed.txId ushr 8) and 0xFF)
    out.write(parsed.txId and 0xFF)
    // Flags: QR=1 (response), AA=1 (authoritative), RD=(copied), RA=1, RCODE=3 (NXDOMAIN)
    val rdBit = parsed.flags and 0x0100
    val respFlags = 0x8483 or rdBit
    out.write((respFlags ushr 8) and 0xFF)
    out.write(respFlags and 0xFF)
    // QDCOUNT = 1, ANCOUNT = 0, NSCOUNT = 1 (SOA for 5s negative TTL), ARCOUNT = 0
    out.write(0x00); out.write(0x01)
    out.write(0x00); out.write(0x00)
    out.write(0x00); out.write(0x01)
    out.write(0x00); out.write(0x00)

    // 2. Question Section (copied verbatim from query bytes 12..questionEndOffset)
    out.write(queryPacket, 12, parsed.questionEndOffset - 12)

    // 3. Authority Section: SOA record pointing to Question QNAME (pointer 0xC00C) with 5-second TTL
    out.write(0xC0); out.write(0x0C) // NAME pointer to offset 12
    out.write(0x00); out.write(0x06) // TYPE = SOA (6)
    out.write(0x00); out.write(0x01) // CLASS = IN (1)
    // TTL = 5 seconds
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x05)
    // RDATA: MNAME = 0xC00C (2B), RNAME = 0xC00C (2B), SERIAL(4B), REFRESH(4B), RETRY(4B), EXPIRE(4B), MINIMUM(4B) = 24 bytes
    out.write(0x00); out.write(24) // RDLENGTH = 24
    out.write(0xC0); out.write(0x0C) // MNAME
    out.write(0xC0); out.write(0x0C) // RNAME
    // SERIAL = 1
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x01)
    // REFRESH = 60
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x3C)
    // RETRY = 60
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x3C)
    // EXPIRE = 60
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x3C)
    // MINIMUM TTL = 5 seconds
    out.write(0x00); out.write(0x00); out.write(0x00); out.write(0x05)

    return out.toByteArray()
  }

  fun buildIpv4UdpPacket(
    srcIp: ByteArray,
    dstIp: ByteArray,
    srcPort: Int,
    dstPort: Int,
    payload: ByteArray
  ): ByteArray {
    val udpLen = 8 + payload.size
    val totalLen = 20 + udpLen
    val out = ByteArray(totalLen)

    // IPv4 Header (20 bytes)
    out[0] = 0x45.toByte() // Version 4, IHL 5 (20 bytes)
    out[1] = 0x00.toByte() // DSCP / ECN
    writeU16(out, 2, totalLen)
    writeU16(out, 4, 0) // Identification
    writeU16(out, 6, 0x4000) // Flags: Don't Fragment
    out[8] = 64.toByte() // TTL
    out[9] = PROTO_UDP.toByte()
    writeU16(out, 10, 0) // Header checksum placeholder
    System.arraycopy(srcIp, 0, out, 12, 4)
    System.arraycopy(dstIp, 0, out, 16, 4)

    val ipChecksum = computeIpv4HeaderChecksum(out, 0, 20)
    writeU16(out, 10, ipChecksum)

    // UDP Header (8 bytes)
    writeU16(out, 20, srcPort)
    writeU16(out, 22, dstPort)
    writeU16(out, 24, udpLen)
    writeU16(out, 26, 0) // UDP checksum placeholder

    // Payload
    System.arraycopy(payload, 0, out, 28, payload.size)

    val udpChecksum = computeTransportChecksum(
      srcIp = srcIp,
      dstIp = dstIp,
      protocol = PROTO_UDP,
      transportSegment = out,
      segmentOffset = 20,
      segmentLength = udpLen
    )
    writeU16(out, 26, if (udpChecksum == 0) 0xFFFF else udpChecksum)

    return out
  }

  fun buildIpv6UdpPacket(
    srcIp: ByteArray,
    dstIp: ByteArray,
    srcPort: Int,
    dstPort: Int,
    payload: ByteArray
  ): ByteArray {
    val udpLen = 8 + payload.size
    val totalLen = 40 + udpLen
    val out = ByteArray(totalLen)

    // IPv6 Header (40 bytes)
    out[0] = 0x60.toByte() // Version 6
    out[1] = 0x00.toByte()
    out[2] = 0x00.toByte()
    out[3] = 0x00.toByte()
    writeU16(out, 4, udpLen) // Payload length
    out[6] = PROTO_UDP.toByte() // Next Header = UDP (17)
    out[7] = 64.toByte() // Hop Limit
    System.arraycopy(srcIp, 0, out, 8, 16)
    System.arraycopy(dstIp, 0, out, 24, 16)

    // UDP Header (8 bytes)
    writeU16(out, 40, srcPort)
    writeU16(out, 42, dstPort)
    writeU16(out, 44, udpLen)
    writeU16(out, 46, 0)

    System.arraycopy(payload, 0, out, 48, payload.size)

    val udpChecksum = computeTransportChecksum(
      srcIp = srcIp,
      dstIp = dstIp,
      protocol = PROTO_UDP,
      transportSegment = out,
      segmentOffset = 40,
      segmentLength = udpLen
    )
    writeU16(out, 46, if (udpChecksum == 0) 0xFFFF else udpChecksum)

    return out
  }

  private fun buildIpv4TcpRstPacket(
    reqPacket: ByteArray,
    ihl: Int,
    reqSrcIp: ByteArray,
    reqDstIp: ByteArray
  ): ByteArray {
    val srcPort = readU16(reqPacket, ihl)
    val dstPort = readU16(reqPacket, ihl + 2)
    val reqSeq = readU32(reqPacket, ihl + 4)
    val reqAck = readU32(reqPacket, ihl + 8)
    val flags = reqPacket[ihl + 13].toInt() and 0xFF

    val out = ByteArray(40)
    out[0] = 0x45.toByte()
    out[1] = 0x00.toByte()
    writeU16(out, 2, 40)
    writeU16(out, 6, 0x4000)
    out[8] = 64.toByte()
    out[9] = PROTO_TCP.toByte()
    System.arraycopy(reqDstIp, 0, out, 12, 4)
    System.arraycopy(reqSrcIp, 0, out, 16, 4)
    writeU16(out, 10, computeIpv4HeaderChecksum(out, 0, 20))

    writeU16(out, 20, dstPort)
    writeU16(out, 22, srcPort)
    val isAck = (flags and 0x10) != 0
    val respSeq = if (isAck) reqAck else 0L
    val respAck = (reqSeq + 1L) and 0xFFFFFFFFL
    writeU32(out, 24, respSeq)
    writeU32(out, 28, respAck)
    out[32] = 0x50.toByte() // Data offset = 5 (20 bytes)
    out[33] = 0x14.toByte() // Flags = RST | ACK
    writeU16(out, 34, 0)
    writeU16(out, 36, 0)
    writeU16(out, 38, 0)

    val tcpChecksum = computeTransportChecksum(
      srcIp = reqDstIp,
      dstIp = reqSrcIp,
      protocol = PROTO_TCP,
      transportSegment = out,
      segmentOffset = 20,
      segmentLength = 20
    )
    writeU16(out, 36, tcpChecksum)
    return out
  }

  private fun buildIpv6TcpRstPacket(
    reqPacket: ByteArray,
    hdrLen: Int,
    reqSrcIp: ByteArray,
    reqDstIp: ByteArray
  ): ByteArray {
    val srcPort = readU16(reqPacket, hdrLen)
    val dstPort = readU16(reqPacket, hdrLen + 2)
    val reqSeq = readU32(reqPacket, hdrLen + 4)
    val reqAck = readU32(reqPacket, hdrLen + 8)
    val flags = reqPacket[hdrLen + 13].toInt() and 0xFF

    val out = ByteArray(60)
    out[0] = 0x60.toByte()
    writeU16(out, 4, 20)
    out[6] = PROTO_TCP.toByte()
    out[7] = 64.toByte()
    System.arraycopy(reqDstIp, 0, out, 8, 16)
    System.arraycopy(reqSrcIp, 0, out, 24, 16)

    writeU16(out, 40, dstPort)
    writeU16(out, 42, srcPort)
    val isAck = (flags and 0x10) != 0
    val respSeq = if (isAck) reqAck else 0L
    val respAck = (reqSeq + 1L) and 0xFFFFFFFFL
    writeU32(out, 44, respSeq)
    writeU32(out, 48, respAck)
    out[52] = 0x50.toByte()
    out[53] = 0x14.toByte() // RST | ACK

    val tcpChecksum = computeTransportChecksum(
      srcIp = reqDstIp,
      dstIp = reqSrcIp,
      protocol = PROTO_TCP,
      transportSegment = out,
      segmentOffset = 40,
      segmentLength = 20
    )
    writeU16(out, 56, tcpChecksum)
    return out
  }

  fun computeIpv4HeaderChecksum(buf: ByteArray, offset: Int, length: Int): Int {
    var sum = 0L
    var i = 0
    while (i + 1 < length) {
      sum += readU16(buf, offset + i).toLong()
      i += 2
    }
    if (i < length) {
      sum += ((buf[offset + i].toInt() and 0xFF) shl 8).toLong()
    }
    while ((sum ushr 16) != 0L) {
      sum = (sum and 0xFFFFL) + (sum ushr 16)
    }
    return (sum.inv() and 0xFFFFL).toInt()
  }

  fun computeTransportChecksum(
    srcIp: ByteArray,
    dstIp: ByteArray,
    protocol: Int,
    transportSegment: ByteArray,
    segmentOffset: Int,
    segmentLength: Int
  ): Int {
    var sum = 0L
    var i = 0
    while (i + 1 < srcIp.size) {
      sum += readU16(srcIp, i).toLong()
      i += 2
    }
    i = 0
    while (i + 1 < dstIp.size) {
      sum += readU16(dstIp, i).toLong()
      i += 2
    }
    sum += (protocol and 0xFFFF).toLong()
    sum += (segmentLength and 0xFFFF).toLong()

    i = 0
    while (i + 1 < segmentLength) {
      sum += readU16(transportSegment, segmentOffset + i).toLong()
      i += 2
    }
    if (i < segmentLength) {
      sum += ((transportSegment[segmentOffset + i].toInt() and 0xFF) shl 8).toLong()
    }

    while ((sum ushr 16) != 0L) {
      sum = (sum and 0xFFFFL) + (sum ushr 16)
    }
    return (sum.inv() and 0xFFFFL).toInt()
  }

  private fun readU16(buf: ByteArray, offset: Int): Int {
    return ((buf[offset].toInt() and 0xFF) shl 8) or (buf[offset + 1].toInt() and 0xFF)
  }

  private fun writeU16(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = ((value ushr 8) and 0xFF).toByte()
    buf[offset + 1] = (value and 0xFF).toByte()
  }

  private fun readU32(buf: ByteArray, offset: Int): Long {
    return ((buf[offset].toLong() and 0xFFL) shl 24) or
      ((buf[offset + 1].toLong() and 0xFFL) shl 16) or
      ((buf[offset + 2].toLong() and 0xFFL) shl 8) or
      (buf[offset + 3].toLong() and 0xFFL)
  }

  private fun writeU32(buf: ByteArray, offset: Int, value: Long) {
    buf[offset] = ((value ushr 24) and 0xFFL).toByte()
    buf[offset + 1] = ((value ushr 16) and 0xFFL).toByte()
    buf[offset + 2] = ((value ushr 8) and 0xFFL).toByte()
    buf[offset + 3] = (value and 0xFFL).toByte()
  }
}
