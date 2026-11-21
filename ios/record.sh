set -euo pipefail
device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]["com.apple.CoreSimulator.SimRuntime.iOS-27-2"]; print(next(d["udid"] for d in ds if d["name"]=="iPhone 18 Pro"))')
xcrun simctl boot "$device"
build=(-project MayrMarket.xcodeproj -scheme MayrMarket -destination "id=$device" -derivedDataPath build -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO)
xcodebuild "${build[@]}" build-for-testing
xcrun simctl bootstatus "$device" -b
xcrun simctl status_bar "$device" override --time 09:41
mkdir -p output
xcrun simctl io "$device" recordVideo --codec=h264 output/MayrMarket.mp4 &
recorder=$!
trap 'kill -INT "$recorder" 2>/dev/null || true' EXIT
xcodebuild "${build[@]}" -resultBundlePath Shopping.xcresult test-without-building
kill -INT "$recorder"; wait "$recorder" || true
trap - EXIT
xcrun xcresulttool export attachments --path Shopping.xcresult --output-path attachments
python3 - <<'PY'
import json, pathlib, shutil, re
root=pathlib.Path('attachments')
for section in json.loads((root/'manifest.json').read_text()):
    for a in section['attachments']:
        m=re.search(r'0[1-9]-[a-z]+',a['suggestedHumanReadableName'])
        if m: shutil.copyfile(root/a['exportedFileName'],'output/'+m.group()+'.png')
assert len(list(pathlib.Path('output').glob('*.png')))==9
PY
