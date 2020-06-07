# One In One Chome extention

This Extantion had been start in the early 2014, to upgrade a 2006 Firefox based project.

this code meant to stay up to date with the last Javascript standard.

## build extention:

```
npm run build
```

```bash
cd dist
version=$(cat manifest.json | grep '"version"' | grep -E -o '[0-9.]+')
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

* V 4.1.6
    - fix multi tab per task

* V 4.1.3
    - add mergeInject in ZTask

* V 4.1.2
    - small bug fix

* V 4.1.0
    - replace sendmessage by a connect loop

* V 4.0.12
    - improve plugin script, add puppeteer test unit.

* V 4.0.11
    - use more async code

* V 4.0.10
    - save proxy user/password between launch
    - lint code

* V 4.0.9
    - add No-close option

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