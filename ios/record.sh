set -euo pipefail
device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-27-2"]; print(next(d["udid"] for d in ds if d["name"]=="iPhone 18 Pro"))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl status_bar "$device" override --time 09:41
xcodebuild -project MayrMarket.xcodeproj -scheme MayrMarket -configuration Debug -destination "id=$device" -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
mkdir -p output
xcrun simctl install "$device" build/Build/Products/Debug-iphonesimulator/MayrMarket.app
bundle=ru.mayrmarket.preview
result="$(xcrun simctl get_app_container "$device" "$bundle" data)/Documents/walkthrough.json"
xcrun simctl io "$device" recordVideo --codec=h264 output/MayrMarket.mp4 &
recorder=$!
trap 'kill -INT "$recorder" 2>/dev/null || true' EXIT
python3 -c 'import time; print(round(time.time()*1000))' > output/start.txt
sleep 2
SIMCTL_CHILD_MAYR_WALKTHROUGH="$(cat Recording/walkthrough.js)" xcrun simctl launch "$device" "$bundle" -AppleLanguages '(ru)' -AppleLocale ru_RU
for ((i=0;i<180;i++)); do [[ -f "$result" ]] && break; sleep 1; done
xcrun simctl io "$device" screenshot output/final.png
kill -INT "$recorder"
wait "$recorder" || true
trap - EXIT
cat "$result"
cp "$result" output/chapters.json
python3 -c 'import json; assert json.load(open("output/chapters.json"))["ok"]'
