package com.djgaming1t.myelin.focusshield
import java.time.ZonedDateTime
import java.util.TimeZone
fun main() {
  fun ms(value:String)=ZonedDateTime.parse(value).toInstant().toEpochMilli()
  TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
  val night="""[{"enabled":true,"label":"Night","days":[6],"startMinuteOfDay":1350,"endMinuteOfDay":390}]"""
  val dst=FocusShieldStore.evaluateScheduleWindows(night,false,ms("2026-11-01T01:30:00-04:00[America/New_York]"))
  check(dst.activeNow);check(dst.currentWindowEndEpochMs==ms("2026-11-01T06:30:00-05:00[America/New_York]"))
  check(!FocusShieldStore.evaluateScheduleWindows(night,false,dst.currentWindowEndEpochMs).activeNow)
  val near="""[{"enabled":true,"label":"Soon","days":[2],"startMinuteOfDay":600,"endMinuteOfDay":660}]"""
  val n=ms("2026-10-20T09:59:58-04:00[America/New_York]")
  check(FocusShieldStore.evaluateScheduleWindows(near,false,n).nextTransitionEpochMs==n+2000)
  check(!FocusShieldStore.evaluateScheduleWindows(near,true,n+5000).activeNow)
  check(!FocusShieldStore.evaluateScheduleWindows("garbage",false,n).activeNow)
  check(FocusShieldStore.computeEscalatedDelaySeconds("hard",10,1)==10)
  check(FocusShieldStore.computeEscalatedDelaySeconds("hard",10,4)==34)
  check(FocusShieldStore.computeEscalatedDelaySeconds("hard",10,100)==120)
  println("PASS: native overnight/DST boundaries, imminent next alarm, session-only gating, malformed schedule and progressive friction")
}
