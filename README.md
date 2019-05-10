# One In One Chome extention

This Extantion had been start in the early 2014, to upgrade a 2006 Firefox based project.

this code meant to stay up to date with the last Javascript standard.

## build extention:

```
# build linux
tsc -p . && \
browserify ./built/background.js  > ./dist/js/background.js && \
browserify ./built/popup.js  > ./dist/js/popup.js && \
cp ./built/client.js ./dist/js/client.js

# single line windows
tsc -p .; copy .\built\client.js .\dist\js\client.js; browserify .\built\popup.js> .\dist\js\popup.js; browserify .\built\background.js> .\dist\js\background.js
```

```bash
cd dist
version=$(cat manifest.json | grep '"version"' | grep -E -o [0-9.]+)
tar -cvzf ../zombie-v${version}.tar.gz .
echo zombie-v${version}.tar.gz generated
```

## todo
- add a gulpFile

## reference

### main developper Pages:
 - [chrome tabs](https://developer.chrome.com/extensions/tabs)

### librarie
- [base64-js](https://github.com/beatgammit/base64-js) basic base64 encoding/decoding in pure JS
- [bootstrap4-toggle](https://gitbrent.github.io/bootstrap4-toggle/) Nice jQuery/Bootstrap Toggle .
- [chrome-promise](https://github.com/tfoxy/chrome-promise) Chrome API using promises. *altered to support retry*
- [pngjs](https://github.com/arian/pngjs) PNG.js is a PNG decoder fully written in JavaScript.
- [jsQR](https://github.com/cozmo/jsQR) A pure javascript port of the ZXing QR parsing library. *altered to support custom depth*

### Icons:
- [materialdesignicons.com](https://materialdesignicons.com/) ison sources
- [material.io](https://material.io/tools/icons/) not used
- [materialpalette.com](https://www.materialpalette.com/icons) not used


### changelog:
* V 4.0.8
    - fix chome 72- compatibility

* V 4.0.7:
    - add emoji

* V 4.0.6:
    - add chome.debugger connection via 'sendCommand' call[beta]
    - since chrome.browsingData.remove's callback may not be called, add a 500 ms timeout to call resolve.

* V 4.0.5:
    - add badges
    - add button to block code injection
    - add plugin version in popup
    - bug fix

* V 4.0.4:
    - add setBlockedDomains({domains:[]})

* V 4.0.3:
    - fix bug in ctrl buttons

* V 4.0.2:
    - add support for user/password auth in proxy

* V 4.0.1:
    - add closeIrrelevantTabs param in registerCommand

* V 4.0.0:
    - Initial public version