# LiteRT-LM 0.17.x currently relies on JNI-visible Kotlin/Java symbols.
# Keep the public runtime surface until upstream consumer rules cover it.
-keep class com.google.ai.edge.litertlm.** { *; }
-dontwarn com.google.ai.edge.litertlm.**
