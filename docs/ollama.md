# Hosting Ollama and testing RSSMonster generation

This guide runs Ollama on Windows 11 and connects RSSMonster's inference service
to it, either on the same machine or from a Linux machine on the LAN. Ollama
provides an [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility),
so no additional proxy is needed for this setup.

```text
RSSMonster server → RSSMonster inference → Ollama → qwen3:0.6b
                    GENERATION_BASE_URL=http://192.168.0.20:11434/v1
```

The IP address throughout this guide is an example. Replace it with your Windows
machine's LAN address. Provider settings belong to `inference/.env` for manual
development; the RSSMonster server connects to the inference service separately.
See [inference administration](inference.md) for that connection and Docker setup.

## 1. Install Ollama and download the model

Install [Ollama for Windows](https://ollama.com/download/windows), then open
PowerShell. The Windows application runs Ollama in the background and serves its
API on `http://localhost:11434` by default.
See the [Windows guide](https://docs.ollama.com/windows).

```powershell
ollama pull qwen3:0.6b
ollama list
ollama run qwen3:0.6b
```

In the interactive session, try `Summarize RSS feeds in one sentence.` and use
`/bye` to exit. The [Qwen3 0.6B model](https://ollama.com/library/qwen3:0.6b)
is a small starting point for integration testing. A successful response confirms
that Ollama can load and run the model; it does not establish generation quality
for RSSMonster's workloads.

## 2. Test the compatible API on Windows

Use PowerShell's JSON serialization to avoid native command-line quoting issues:

```powershell
Invoke-RestMethod -Uri 'http://localhost:11434/v1/models'

$body = @{
    model = 'qwen3:0.6b'
    messages = @(
        @{ role = 'user'; content = 'Summarize what RSS is in one sentence.' }
    )
    stream = $false
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod `
    -Method Post `
    -Uri 'http://localhost:11434/v1/chat/completions' `
    -ContentType 'application/json' `
    -Body $body `
    -TimeoutSec 120

$response.choices[0].message.content
```

Expect the model list to contain `qwen3:0.6b` and the chat request to return text.

RSSMonster needs the base URL ending in `/v1`. Ollama's native `/api/chat` endpoint
is a different API and must not be used as `GENERATION_BASE_URL`.

## 3. Make Ollama reachable from the LAN

Skip this section when inference can already reach Ollama through localhost.
On another machine or inside a container, `localhost` refers to that environment,
not the Windows host.

Quit Ollama from the Windows system tray before changing its listener. For a
temporary foreground server, run this in PowerShell and leave the terminal open:

```powershell
$env:OLLAMA_HOST = '0.0.0.0:11434'
ollama serve
```

For a persistent setting instead, run:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_HOST', '0.0.0.0:11434', 'User')
```

Then relaunch Ollama from the Start menu. Run either the background application
or the foreground server; a second listener on the same port will fail.
These settings follow Ollama's [server configuration instructions](https://docs.ollama.com/faq#how-do-i-configure-ollama-server).

Use `ipconfig` to find the Windows LAN IPv4 address. If Windows Defender Firewall
blocks the connection, allow inbound TCP port `11434` on the trusted network
profile, restricted to the inference machine's IP where possible. Keep the Windows
machine awake while testing. `0.0.0.0` is a listening address; clients use the
machine's actual IP.

Ollama's local API does not require authentication; the `ollama` key below is a
placeholder required by the client, not access protection. Keep this listener on
a trusted LAN and do not forward port `11434` from the public internet.
See [Ollama's compatible client example](https://docs.ollama.com/api/openai-compatibility).

## 4. Test from the inference machine

Run these commands from the Linux host or container that will run inference:

```bash
curl --fail-with-body --connect-timeout 5 --max-time 10 \
  http://192.168.0.20:11434/v1/models

curl --fail-with-body --connect-timeout 5 --max-time 120 \
  http://192.168.0.20:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3:0.6b",
    "messages": [{
      "role": "user",
      "content": "Return exactly: RSSMonster Ollama test successful"
    }],
    "stream": false
  }'
```

The first request checks reachability and installed model IDs. The second checks
actual generation: inspect `choices[0].message.content`. Exact wording is not a
connectivity requirement. The first generation may take longer while the model
loads; neither command retries automatically.

## 5. Configure and start RSSMonster inference

For an existing manual installation, edit the corresponding settings in
`inference/.env`. If setting up inference for the first time, start from
`inference/.env.example` as described in the [inference README](../inference/README.md#setup).
Replace existing values instead of adding duplicate entries:

```env
GENERATION_PROVIDER=openai-compatible
GENERATION_BASE_URL=http://192.168.0.20:11434/v1
GENERATION_MODEL=qwen3:0.6b
GENERATION_API_KEY=ollama
```

Use `http://localhost:11434/v1` only when that address reaches Ollama from the
inference process. `GENERATION_API_KEY` must be nonempty in RSSMonster even though
local Ollama ignores it. It is separate from `INFERENCE_API_KEY`, which protects
the RSSMonster inference service itself.

Keep the existing embedding and classification configuration. Starting from the
example file leaves those providers local, so their models still initialize and
may download on first startup. Generation settings do not configure embeddings,
classification scoring, or assistant chat. Remove any unintended
`GENERATION_ARTICLE_MODEL`, `GENERATION_SMART_FOLDER_MODEL`, or
`GENERATION_FEED_REDISCOVERY_MODEL` overrides when all generation should use
`qwen3:0.6b`.

From the repository root:

```bash
cd inference
npm run dev
```

Restart the process after editing `.env`. Development mode enables
`INFERENCE_DEBUG=true` and logs this handshake on startup:

```text
[INFERENCE] Generation handshake checking provider=openai-compatible
[INFERENCE] Generation handshake succeeded: endpoint responding, model="qwen3:0.6b" available (generation not tested)
```

The handshake queries `/v1/models` with the configured credentials and checks the
default generation model ID. It has a five-second timeout, makes no retries, and
does not block startup or determine `/ready` status. It does not check workload
model overrides or generate text. Failures produce a warning; a missing model
produces this specific message:

```text
[INFERENCE] Generation handshake failed: endpoint responded but configured model="qwen3:0.6b" was not listed
```

Connection, HTTP, and timeout failures log safe error metadata. The handshake
also runs when starting with `INFERENCE_DEBUG=true` outside `npm run dev`, and is
skipped for `GENERATION_PROVIDER=local`.

### Optional assistant handshake

To use the same Ollama host for the assistant, configure these settings separately
in `inference/.env`, then restart inference:

```env
ASSISTANT_PROVIDER=openai-compatible
ASSISTANT_BASE_URL=http://192.168.0.20:11434/v1
ASSISTANT_MODEL=qwen3:0.6b
ASSISTANT_API_KEY=ollama
```

With development diagnostics enabled, startup also logs:

```text
[INFERENCE] Assistant handshake checking provider=openai-compatible
[INFERENCE] Assistant handshake succeeded: endpoint responding, model="qwen3:0.6b" available (generation not tested)
```

This check uses the assistant's own endpoint, credentials, and model. It follows
the same five-second timeout, no-retry, and non-blocking behavior as the generation
handshake, with `Assistant handshake failed` warnings on failure. An unconfigured
assistant is skipped. Existing legacy OpenAI credential/endpoint fallbacks still
apply. A successful check does not verify tool calling, streaming, or response
quality; it only confirms that the endpoint lists the configured model.
Server-side assistant permissions are configured separately; see
[Assistant and MCP](assistant.md).

## 6. Test generation through RSSMonster inference

Once the configured local models have loaded, check readiness and submit a small
label request from the inference host:

```bash
curl --fail-with-body --max-time 10 http://127.0.0.1:3001/ready

curl --fail-with-body --max-time 120 \
  http://127.0.0.1:3001/api/semantic-labels \
  -H 'Content-Type: application/json' \
  -d '{
    "context": "Article titles: Growing tomatoes in containers; Choosing soil for tomato plants; Watering balcony tomatoes",
    "island": true
  }'
```

If `INFERENCE_API_KEY` is configured, add `-H "X-Inference-API-Key: $INFERENCE_API_KEY"`
to both commands after setting that shell variable to your configured secret.
Use the configured host and port if different from the defaults above.

This exercises RSSMonster's generation adapter and response handling without
writing to the RSSMonster database. A label or `null` is a valid result; inspect
the inference logs as well. A small model can pass the connectivity handshake
while struggling with structured output or producing weak labels.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Connection refused | Ollama is running, the IP and port are correct, and the listener was restarted after changing `OLLAMA_HOST`. |
| Connection timeout | Windows firewall, network reachability, host sleep, and whether the request originates inside a container or WSL environment. |
| Port already in use | Quit the Ollama tray application before running `ollama serve`, or use the existing background application. |
| Endpoint responds but model is not listed | Run `ollama list` on the Ollama host, pull the model, and match the full model ID including its tag. |
| HTTP 401 or 403 | Check any gateway authentication and the configured key. A direct local Ollama installation normally needs no authentication. |
| HTTP 404 | Verify the base URL ends in `/v1` and does not include `/chat/completions` or `/api/chat`. |
| Handshake succeeds but `/ready` returns 503 | Other configured models may still be initializing; inspect startup logs. The handshake is independent of readiness. |
| Handshake succeeds but generation fails | Test chat completions directly, check workload model overrides, and inspect response-format or resource failures. |
| No handshake log | Run `npm run dev` in `inference/`, verify the generation provider is compatible, and check earlier configuration/startup errors. |

For Windows Ollama logs, inspect `%LOCALAPPDATA%\Ollama\server.log` as described
in the [Windows troubleshooting guide](https://docs.ollama.com/windows#troubleshooting).

After the small model works, you can test another Qwen3 variant by pulling it on
the Ollama host, changing `GENERATION_MODEL`, and restarting inference. For example:

```powershell
ollama pull qwen3:1.7b
```

```env
GENERATION_MODEL=qwen3:1.7b
```

Repeat both the handshake and generation tests when switching models. Consult the
[Qwen3 library](https://ollama.com/library/qwen3) for available variants and sizes.
