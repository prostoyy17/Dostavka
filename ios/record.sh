set -euo pipefail
device=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; ds=json.load(sys.stdin)["devices"]; print(next(d["udid"] for k in reversed(sorted(ds)) if "iOS" in k for d in ds[k] if d["name"].startswith("iPhone")))')
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl status_bar "$device" override --time 09:41
build=(-project MayrMarket.xcodeproj -scheme MayrMarket -destination "id=$device" -derivedDataPath build -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO)
xcodebuild "${build[@]}" build-for-testing
mkdir -p output
# Open the app before recording so the first frame is the catalog.
xcrun simctl install "$device" build/Build/Products/Debug-iphonesimulator/MayrMarket.app
xcrun simctl launch "$device" ru.mayrmarket.preview
sleep 2
xcrun simctl io "$device" recordVideo --codec=h264 output/MayrMarket.mp4 &
recorder=$!
trap 'kill -INT "$recorder" 2>/dev/null || true' EXIT
xcodebuild "${build[@]}" -resultBundlePath Shopping.xcresult test-without-building
kill -INT "$recorder"
wait "$recorder"
trap - EXIT
xcrun xcresulttool export attachments --path Shopping.xcresult --output-path attachments
python3 - <<'PY'
import json, pathlib, shutil
root=pathlib.Path('attachments')
for section in json.loads((root/'manifest.json').read_text()):
    for attachment in section['attachments']:
        name=attachment['suggestedHumanReadableName']
        for prefix in ('01-catalog','02-product','03-cart'):
            if prefix in name:
                shutil.copyfile(root/attachment['exportedFileName'],f'output/{prefix}.png')
PY
for screen in 01-catalog 02-product 03-cart; do test -s "output/$screen.png"; done
