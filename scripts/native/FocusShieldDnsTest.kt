package com.djgaming1t.myelin.focusshield

fun query(host: String, type: Int = 1): ByteArray {
  val bytes = mutableListOf<Byte>(0x12,0x34,1,0,0,1,0,0,0,0,0,0)
  for (label in host.split('.')) { bytes.add(label.length.toByte()); bytes.addAll(label.toByteArray().toList()) };bytes.add(0)
  bytes.add(0);bytes.add(type.toByte());bytes.add(0);bytes.add(1);return bytes.toByteArray()
}
fun request(protocol: Int, body: ByteArray, seq: Long = 0, ack: Long = 0, flags: Int = 0): ByteArray {
  val transport=if(protocol==17)8 else 20;val b=ByteArray(20+transport+body.size)
  b[0]=0x45;FocusShieldDns.put16(b,2,b.size);b[8]=64;b[9]=protocol.toByte()
  byteArrayOf(10,111,222.toByte(),2).copyInto(b,12);byteArrayOf(10,111,222.toByte(),1).copyInto(b,16)
  FocusShieldDns.put16(b,20,49152);FocusShieldDns.put16(b,22,53)
  if(protocol==17)FocusShieldDns.put16(b,24,8+body.size) else {FocusShieldDns.put32(b,24,seq);FocusShieldDns.put32(b,28,ack);b[32]=0x50;b[33]=flags.toByte()}
  body.copyInto(b,20+transport);return b
}
fun main() {
  val q=query("m.youtube.com");check(FocusShieldDns.question(q)?.host=="m.youtube.com")
  val rules=listOf(FocusShieldDns.Rule("youtube.com",true));check(FocusShieldDns.blocked("m.youtube.com",rules));check(!FocusShieldDns.blocked("youtube.com.evil.test",rules))
  check(FocusShieldDns.normalizeDomain("bad-.example")==null)
  val blocked=FocusShieldDns.error(q,3);check(blocked[3].toInt() and 15==3);check(FocusShieldDns.validAnswer(q,blocked))
  val raw=request(17,q);val packet=FocusShieldDns.parsePacket(raw,raw.size)!!
  val response=FocusShieldDns.reply(packet,blocked);check(FocusShieldDns.checksum(response.copyOf(20))==0)
  val pseudo=ByteArray(12+response.size-20);response.copyInto(pseudo,0,12,20);pseudo[9]=17;FocusShieldDns.put16(pseudo,10,response.size-20);response.copyInto(pseudo,12,20)
  check(FocusShieldDns.checksum(pseudo)==0)
  check(FocusShieldDns.parsePacket(raw,raw.size-1)==null)
  val fragments=raw.copyOf();fragments[6]=0x20;check(FocusShieldDns.parsePacket(fragments,fragments.size)==null)
  for(size in 0 until q.size)check(FocusShieldDns.question(q.copyOf(size))==null)
  val multiple=q.copyOf();multiple[5]=2;check(FocusShieldDns.question(multiple)==null)
  val pointer=q.copyOf();pointer[12]=0xc0.toByte();check(FocusShieldDns.question(pointer)==null)
  val sent=mutableListOf<ByteArray>();var resolved=0
  val tcp=FocusShieldDnsTcp({sent.add(it)}){query,complete->resolved++;complete(FocusShieldDns.error(query,3))}
  fun input(body:ByteArray=byteArrayOf(),seq:Long=100,ack:Long=0,flags:Int=16){val b=request(6,body,seq,ack,flags);tcp.accept(FocusShieldDns.parsePacket(b,b.size)!!,1)}
  input(flags=2);check(sent.size==1);val synAck=sent.last();check(synAck[33].toInt() and 0x12==0x12)
  val serverSeq=FocusShieldDns.u32(synAck,24);input(seq=101,ack=(serverSeq+1)and 0xffffffffL)
  val framed=ByteArray(q.size+2);FocusShieldDns.put16(framed,0,q.size);q.copyInto(framed,2)
  input(framed.copyOfRange(0,5),seq=101,ack=(serverSeq+1)and 0xffffffffL)
  input(framed.copyOfRange(5,framed.size),seq=106,ack=(serverSeq+1)and 0xffffffffL)
  check(resolved==1);check(sent.any{it.size>40 && (it[33].toInt() and 8)!=0})
  input(framed.copyOfRange(5,framed.size),seq=106,ack=(serverSeq+1)and 0xffffffffL);check(resolved==1)
  println("PASS: native DNS query bounds, suffix matching, NXDOMAIN, IPv4/UDP checksums, fragments, truncation, TCP handshake, split framing and duplicate delivery")
}
