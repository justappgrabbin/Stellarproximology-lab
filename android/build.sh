#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "$0")/.." && pwd)
tool_root=${ANDROID_TOOLS_ROOT:-/workspace/android-tools}
platform_jar=${ANDROID_JAR:-$tool_root/android-35/android.jar}
build_tools=${ANDROID_BUILD_TOOLS:-$tool_root/android-15}
output_dir="$project_root/android/build"
mkdir -p "$output_dir/classes" "$output_dir/assets"
cp "$project_root"/mobile/{index.html,app.js,engine.js,style.css,profiles.json,manifest.webmanifest,icon.svg} "$output_dir/assets/"
java com.sun.tools.javac.Main -source 11 -target 11 -classpath "$platform_jar" -d "$output_dir/classes" "$project_root"/android/src/org/stellar/livinglab/*.java
"$build_tools/d8" --min-api 26 --lib "$platform_jar" --output "$output_dir" $(find "$output_dir/classes" -name '*.class')
"$build_tools/aapt2" link -I "$platform_jar" --manifest "$project_root/android/AndroidManifest.xml" --min-sdk-version 26 --target-sdk-version 35 -A "$output_dir/assets" -o "$output_dir/unsigned.apk"
python - "$output_dir" <<'PY'
import sys,zipfile
from pathlib import Path
p=Path(sys.argv[1])
with zipfile.ZipFile(p/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write(p/'classes.dex','classes.dex')
PY
"$build_tools/zipalign" -f -p 4 "$output_dir/unsigned.apk" "$output_dir/aligned.apk"
key_path=${ANDROID_SIGNING_KEY:-$project_root/android/local-debug.keystore}
if [ ! -f "$key_path" ]; then
  keytool -genkeypair -keystore "$key_path" -storepass android -keypass android -alias stellar-debug -dname 'CN=Stellar Local Development' -keyalg RSA -keysize 2048 -validity 3650
fi
"$build_tools/apksigner" sign --ks "$key_path" --ks-pass pass:android --out "$output_dir/Stellar-Living-Lab-debug.apk" "$output_dir/aligned.apk"
"$build_tools/apksigner" verify --verbose "$output_dir/Stellar-Living-Lab-debug.apk"
printf '%s\n' "$output_dir/Stellar-Living-Lab-debug.apk"
