package com.djgaming1t.myelin.litertlm

import android.net.Uri
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.LogSeverity
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class MyelinLiteRtLmModule : Module() {
  private data class SessionRecord(
    val engine: Engine,
    @Volatile var activeConversation: Conversation? = null,
    @Volatile var closeRequested: Boolean = false,
  )

  private val sessions = ConcurrentHashMap<String, SessionRecord>()

  override fun definition() = ModuleDefinition {
    Name("MyelinLiteRtLm")

    Function("isAvailable") {
      true
    }

    Function("runtimeInfo") {
      mapOf(
        "runtimeId" to "litert-lm",
        "backend" to "CPU",
        "libraryVersion" to "0.16.1",
        "supportsCancellation" to true,
        "automaticToolCalling" to false,
      )
    }

    AsyncFunction("load") { modelUri: String, maxNumTokens: Int? ->
      val modelPath = normalizeModelPath(modelUri)
      val modelFile = File(modelPath)
      require(modelFile.isFile) {
        "LiteRT-LM model file does not exist at the installed URI."
      }

      Engine.setNativeMinLogSeverity(LogSeverity.ERROR)

      val engine =
        Engine(
          EngineConfig(
            modelPath = modelFile.absolutePath,
            backend = Backend.CPU(),
            maxNumTokens = maxNumTokens?.takeIf { it > 0 },
          )
        )

      try {
        engine.initialize()
      } catch (error: Throwable) {
        if (engine.isInitialized()) {
          runCatching { engine.close() }
        }
        throw error
      }

      val sessionId = UUID.randomUUID().toString()
      sessions[sessionId] = SessionRecord(engine = engine)
      sessionId
    }

    AsyncFunction("generate") {
        sessionId: String,
        prompt: String,
        maxOutputTokens: Int? ->
      val record =
        sessions[sessionId]
          ?: throw IllegalStateException("LiteRT-LM session is not loaded.")
      val cleanPrompt = prompt.trim()
      require(cleanPrompt.isNotEmpty()) { "Prompt cannot be empty." }

      val conversation: Conversation =
        synchronized(record) {
          check(!record.closeRequested) { "LiteRT-LM session is closing." }
          check(record.activeConversation == null) {
            "This LiteRT-LM session is already generating."
          }

          record.engine
            .createConversation(
              ConversationConfig(
                automaticToolCalling = false,
              )
            )
            .also { record.activeConversation = it }
        }

      try {
        val response =
          conversation.sendMessage(
            cleanPrompt,
            maxOutputToken = maxOutputTokens?.takeIf { it > 0 },
          )
        response.text
      } finally {
        synchronized(record) {
          record.activeConversation = null
          runCatching { conversation.close() }
          finalizeCloseIfRequested(sessionId, record)
        }
      }
    }

    AsyncFunction("cancel") { sessionId: String ->
      sessions[sessionId]?.activeConversation?.let { conversation ->
        runCatching { conversation.cancelProcess() }
      }
    }

    AsyncFunction("close") { sessionId: String ->
      requestClose(sessionId)
    }

    AsyncFunction("closeAll") {
      sessions.keys.toList().forEach { requestClose(it) }
    }

    OnDestroy {
      sessions.keys.toList().forEach { requestClose(it) }
    }
  }

  private fun normalizeModelPath(modelUri: String): String {
    val trimmed = modelUri.trim()
    require(trimmed.isNotEmpty()) { "Model URI cannot be empty." }

    if (!trimmed.startsWith("file://")) {
      return trimmed
    }

    return Uri.parse(trimmed).path
      ?: throw IllegalArgumentException("Could not resolve the local model file path.")
  }

  private fun requestClose(sessionId: String) {
    val record = sessions[sessionId] ?: return

    synchronized(record) {
      record.closeRequested = true
      val active = record.activeConversation
      if (active != null) {
        runCatching { active.cancelProcess() }
        return
      }
      finalizeCloseIfRequested(sessionId, record)
    }
  }

  private fun finalizeCloseIfRequested(sessionId: String, record: SessionRecord) {
    if (!record.closeRequested || record.activeConversation != null) return
    if (!sessions.remove(sessionId, record)) return

    if (record.engine.isInitialized()) {
      runCatching { record.engine.close() }
    }
  }
}
