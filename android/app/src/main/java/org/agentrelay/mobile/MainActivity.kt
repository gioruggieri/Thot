package org.agentrelay.mobile

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class MainActivity : Activity() {
    private val client = OkHttpClient()
    private var baseUrl = "http://10.0.2.2:8080"
    private var token: String? = null
    private var selectedDesktopId: String? = null
    private var selectedAgentId: String? = null
    private var conversationId: String? = null
    private lateinit var logView: TextView
    private lateinit var desktopSpinner: Spinner
    private lateinit var agentSpinner: Spinner
    private val desktops = mutableListOf<Device>()
    private val agents = mutableListOf<Agent>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
    }

    private fun buildLayout(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        val relayInput = EditText(this).apply {
            hint = "Relay URL"
            setText(baseUrl)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        val emailInput = EditText(this).apply {
            hint = "Email"
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val passwordInput = EditText(this).apply {
            hint = "Password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val loginButton = Button(this).apply {
            text = "Login / Register Android"
            setOnClickListener {
                baseUrl = relayInput.text.toString().trim().trimEnd('/')
                login(emailInput.text.toString(), passwordInput.text.toString())
            }
        }

        desktopSpinner = Spinner(this)
        agentSpinner = Spinner(this)
        val refreshButton = Button(this).apply {
            text = "Refresh Desktops / Agents"
            setOnClickListener { loadDevices() }
        }
        val commandInput = EditText(this).apply {
            hint = "Command"
            minLines = 3
        }
        val commandType = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf("chat", "task", "shell", "file_action", "automation"))
        }
        val sendButton = Button(this).apply {
            text = "Send Command"
            setOnClickListener {
                ensureConversation { sendCommand(commandType.selectedItem.toString(), commandInput.text.toString()) }
            }
        }

        logView = TextView(this).apply {
            text = "Not connected"
            setTextIsSelectable(true)
        }

        root.addView(relayInput)
        root.addView(emailInput)
        root.addView(passwordInput)
        root.addView(loginButton)
        root.addView(refreshButton)
        root.addView(TextView(this).apply { text = "Desktop" })
        root.addView(desktopSpinner)
        root.addView(TextView(this).apply { text = "Agent" })
        root.addView(agentSpinner)
        root.addView(commandType)
        root.addView(commandInput)
        root.addView(sendButton)
        root.addView(ScrollView(this).apply { addView(logView) })
        return root
    }

    private fun login(email: String, password: String) {
        post("/api/auth/login", JSONObject().put("email", email).put("password", password)) { response ->
            token = response.getString("token")
            append("Logged in")
            registerAndroid()
            openMobileSocket()
            loadDevices()
        }
    }

    private fun registerAndroid() {
        post("/api/devices", JSONObject().put("name", android.os.Build.MODEL).put("kind", "android")) {
            append("Android device registered")
        }
    }

    private fun loadDevices() {
        get("/api/devices") { response ->
            desktops.clear()
            val items = response.getJSONArray("devices")
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                if (item.getString("kind") == "desktop" && !item.optBoolean("revoked")) {
                    desktops.add(Device(item.getString("id"), item.getString("name")))
                }
            }
            runOnUiThread {
                desktopSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, desktops.map { it.name })
                if (desktops.isEmpty()) {
                    selectedDesktopId = null
                    agents.clear()
                    agentSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("No agents"))
                    append("No desktop hosts found. Start desktop-host, then refresh.")
                    return@runOnUiThread
                }
                desktopSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                    override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                        selectedDesktopId = desktops[position].id
                        loadAgents(desktops[position].id)
                    }
                    override fun onNothingSelected(parent: AdapterView<*>?) = Unit
                }
            }
        }
    }

    private fun loadAgents(deviceId: String) {
        get("/api/devices/$deviceId/agents") { response ->
            agents.clear()
            val items = response.getJSONArray("agents")
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                agents.add(Agent(item.getString("id"), item.getString("name")))
            }
            runOnUiThread {
                agentSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, agents.map { it.name })
                if (agents.isEmpty()) {
                    selectedAgentId = null
                    agentSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("No agents"))
                    append("No agents found for this desktop. Check that desktop-host is connected.")
                    return@runOnUiThread
                }
                agentSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                    override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                        selectedAgentId = agents[position].id
                        conversationId = null
                    }
                    override fun onNothingSelected(parent: AdapterView<*>?) = Unit
                }
            }
        }
    }

    private fun ensureConversation(next: () -> Unit) {
        if (conversationId != null) {
            next()
            return
        }
        val desktopId = selectedDesktopId ?: return append("Select a desktop")
        val agentId = selectedAgentId ?: return append("Select an agent")
        post("/api/conversations", JSONObject().put("desktopDeviceId", desktopId).put("agentId", agentId)) { response ->
            conversationId = response.getString("id")
            next()
        }
    }

    private fun sendCommand(type: String, text: String) {
        val risk = if (type == "shell" || type == "file_action") "high" else "low"
        val body = JSONObject()
            .put("conversationId", conversationId)
            .put("commandType", type)
            .put("riskLevel", risk)
            .put("text", text)
            .put("approved", risk == "high")
        post("/api/commands", body) { response ->
            append("Command queued: ${response.optString("delivery")}")
        }
    }

    private fun openMobileSocket() {
        val ws = baseUrl.replace("http", "ws") + "/ws/mobile?token=" + token
        client.newWebSocket(Request.Builder().url(ws).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) = append(text)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = append("WebSocket error: ${t.message}")
        })
    }

    private fun get(path: String, onSuccess: (JSONObject) -> Unit) {
        val request = Request.Builder().url(baseUrl + path).header("Authorization", "Bearer $token").build()
        client.newCall(request).enqueue(callback(onSuccess))
    }

    private fun post(path: String, body: JSONObject, onSuccess: (JSONObject) -> Unit) {
        val request = Request.Builder()
            .url(baseUrl + path)
            .header("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(request).enqueue(callback(onSuccess))
    }

    private fun callback(onSuccess: (JSONObject) -> Unit) = object : Callback {
        override fun onFailure(call: Call, e: IOException) = append("HTTP error: ${e.message}")
        override fun onResponse(call: Call, response: Response) {
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) return append("HTTP ${response.code}: $text")
            onSuccess(JSONObject(text))
        }
    }

    private fun append(text: String) = runOnUiThread {
        logView.text = "${logView.text}\n$text"
    }

    data class Device(val id: String, val name: String)
    data class Agent(val id: String, val name: String)
}
