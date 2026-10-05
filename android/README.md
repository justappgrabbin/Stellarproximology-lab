# Stellar Living Lab — native Android core

The APK owns its backend. There is no required cloud database, remote worker,
or hosted app server. The native service, SQLite memory, FTS retrieval index,
relationship graph, small trainable neural encoder, and declarative capability
runtime are packaged with the phone UI.

## What is implemented

- 64 binary units per Movement, Evolution, Being, and Design: 256 distinct IDs.
- Three heart bigrams, two mind trigrams, and one body hexagram for every unit.
- Source-specific profiles and differing keynotes, with no forced consensus.
- 2,304 initial directed graph edges: six one-line transitions and three
  same-pattern cross-perspective links per unit. User relations grow from use.
- A local 12×12 tanh encoder trained on positive interaction and negative
  contrast pairs, with saved weights and finite bounded relationship scores.
- A touchable, rotating depth projection of particle figures, with binary
  identities visible on zoom. This is an initial scene, not a full everyday-life
  simulation or a completed linguistic BANTU representation.
- A durable research queue, foreground service, restart-after-boot receiver,
  and user-enabled periodic research. Force-stop and Android power restrictions
  can interrupt it; continuous 24/7 operation cannot be guaranteed by an APK.
- Research discovery through the Wikipedia API, SQLite full-text RAG with
  local neural re-ranking, an optional GitHub README hand, and a Streamable HTTP
  MCP client (initialize, tools/list, configured tools/call).
- Exactly four optional HF inference slots. Proposals preserve perspective and
  cite retrieved source IDs. Unsupported citations fail.
- Native validation and promotion of bounded declarative relationship rules.
  Rules run locally on later user events without continued LLM calls.
- When no live model is assigned, the local learned encoder proposes bounded
  rules from context affinity instead. This mode is labeled local-neural and
  makes no claim of general language reasoning or verified linguistic meaning.
- Credentials encrypted with a device-owned Android Keystore AES-GCM key.
  The WebView cannot read credentials. External pages open outside the bridge.
- User-triggered export includes all evidence, event history, relationship
  edges, capabilities, and neural weights, while leaving the credential vault out.
- Explicit GitHub export to a new branch; observations and credentials are
  excluded. No automatic remote code merge or publication occurs.

The neural encoder is a small local relationship learner, not a bundled
pretrained general-purpose LLM or the user's existing Trident model. Live
language-model hypotheses use optional HF inference credentials/model IDs;
four pretrained on-device LLM weights and their Android inference runtime are
not included. The backend and relationship learning work without those calls.

The APK grows validated declarative capabilities, not arbitrary executable
Java/Dex/APK code. The Python research-and-code engine in `../autonomy/` is a
separate development tool and does not run Docker inside the phone.

## Use the prototype

Install `build/Stellar-Living-Lab-debug.apk` on Android 8 or later. Android may
ask you to allow installation from the selected file source. This is a locally
signed development APK, not a production release or Play Store submission.

1. Open the app. Its catalog and local memory are initialized on the phone.
2. Use the offline demo to validate and add four bounded native rules. No LLM
   call is claimed. Touch the scene to record interactions and train relations.
3. Open **On-device settings & external hands** to configure optional read
   hands, MCP endpoint/tool/arguments, and four HF model slots. Provider tokens
   are encrypted locally and never included in memory exports.
4. Submit a research goal to start the foreground core. An ongoing notification
   indicates the service. Use Stop to disable the service and periodic work.
5. Enable autonomous follow-up for one research task every 30 minutes while
   the foreground service runs. Configure research hands and model access first.

MCP autonomous calls are restricted to the exact tool configured by the user;
the app does not infer safety from a tool name or server annotation. `$goal`
substitution is supported for top-level argument values. Inspect tools to check
the endpoint's schema before selecting a research tool.

Web/GitHub/MCP results are stored as retrieved evidence, not treated as trusted
instructions. Citation existence is checked; semantic support is not proven.
Research errors are recorded. Configured LLM failures block that perspective;
unconfigured slots use the explicitly labeled local-neural hypothesis mode.
The first native loop generates one bounded rule per perspective and records a
structural test/reflection; it does not yet implement general self-directed app
rewrites or model-driven recursive reflection across arbitrary hypotheses.

## Build and verification

Supply Android platform 35, build-tools 35, Java 11+ compiler, Python 3, and a
development signing key. Override `ANDROID_JAR`, `ANDROID_BUILD_TOOLS`, and
`ANDROID_SIGNING_KEY` to match your installation.

```sh
bash android/build.sh
java com.sun.tools.javac.Main -d android/build/neural-test \
  android/src/org/stellar/livinglab/GraphNet.java android/tests/GraphNetTest.java
java -cp android/build/neural-test GraphNetTest
```

The build creates and verifies v2/v3 APK signatures. The development key stays
ignored locally. A production release needs its own securely retained signing
key and upgrade policy. The source build has no Gradle or third-party Android
runtime dependency.

Compilation/signature checks, JVM neural-learning tests, browser UI tests, and
the separate code-builder sandbox tests do not substitute for device testing.
Foreground-service lifecycle, Android Keystore, SQLite, boot behavior, and
native external hands still need testing on a real phone or Android emulator.
