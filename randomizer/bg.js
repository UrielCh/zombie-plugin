const endpoint = 'https://api-js.dat' + 'adome.co/js/';

sendData = (tabId, jsData, cid, ddk, Referer, request, ddv, custom) => {
  custom = custom || '';
  console.log(`sendData(${tabId}, '${jsData}', '${cid}', '${ddk}', '${Referer}', '${request}', '${ddv}', '${custom}')`)
  let queryString =
    'jsData=' + encodeURIComponent(jsData) +
    '&cid=' + encodeURIComponent(cid) +
    '&ddk=' + encodeURIComponent(ddk) +
    '&Referer=' + encodeURIComponent(Referer) +
    '&request=' + encodeURIComponent(request) +
    '&ddv=' + ddv;
  if (custom) {
    queryString += '&custom=' + custom;
  }
  toappend = `console.log('send datadom/js');
  let xmlhttp = new XMLHttpRequest();
  xmlhttp.open('POST', '${endpoint}', true);
  xmlhttp.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xmlhttp.send('${queryString}');`;

  let code = `{
    const script = document.createElement('script');
    script.innerHTML = \`${toappend}\`;
    let parent = (document.head || document.body || document.documentElement);
    let firstChild = (parent.childNodes && (parent.childNodes.length > 0)) ? parent.childNodes[0] : null;
    parent.insertBefore(script, firstChild || null);
  }`;
  
  return chrome.tabs.executeScript(tabId, {
    code,
    allFrames: false
  }, (e)=> {console.log('done', e)})
}

forceData = (data) => {
  if (!data)
    return data;
  const expected = {
    rs_h: 1080, rs_w: 1920,
    rs_cd: 24, lg: 'fr-FR',
    plg: 3, pr: 1,
    ars_w: 1920, ars_h: 1040,
    ll: false, lo: false, lr: false, sln: false, nm: false, phe: false,
    lb: false, str_ss: true, str_ls: true, str_idb: true, str_odb: true,
    abk: false, wbd: false, gl: true, lgs: true, img: true,
  }
  for (k of Object.keys(expected)) {
    if (data[k] === undefined)
      continue;
    const v = expected[k];
    if (v != data[k]) {
      console.log(`change dd.${k}:${data[k]} to ${v}`);
      data[k] = v
    }
  }
  const { ts_mtp, ts_tec, ts_tsa } = data;
  console.log({ ts_mtp, ts_tec, ts_tsa })
  return data;
};

const queryMod = function (details) {
  console.log(details);
  let { tabId } = details;
  if (details && details.requestBody && details.requestBody.raw && details.requestBody.raw[0]) {
    let queryString = new TextDecoder("utf-8").decode(details.requestBody.raw[0].bytes)
    let formData = {};
    queryString.split('&').forEach(s => { const [k, v] = s.split('='); formData[k] = decodeURIComponent(v) })
    let jsDataStr = formData.jsData;
    let jsData = JSON.parse(jsDataStr)
    jsData = forceData(jsData);
    let jsDataStr2 = JSON.stringify(jsData)
    if (jsDataStr != jsDataStr2) {
      const { cid, ddk, Referer, request, ddv, custom } = formData;
      sendData(tabId, jsDataStr2, cid, ddk, Referer, request, ddv, custom)
      return { cancel: true };
    }
  } else if (details && details.requestBody && details.requestBody.formData) {
    const formData = details.requestBody.formData;
    let jsDataStr = details.requestBody.formData.jsData[0];
    let jsData = JSON.parse(jsDataStr)
    jsData = forceData(jsData);
    let jsDataStr2 = JSON.stringify(jsData)
    if (jsDataStr != jsDataStr2) {
      const { cid, ddk, Referer, request, ddv, custom } = formData;
      sendData(tabId, jsDataStr2, cid, ddk, Referer, request, ddv, custom)
      return { cancel: true };
    }
  }
  return {};
};
if (!chrome.webRequest.onBeforeRequest.hasListener(queryMod)) {
  const requestFilter = { urls: [endpoint] };
  const extraInfoSpec = ['requestBody', 'blocking'];
  chrome.webRequest.onBeforeRequest.addListener(queryMod, requestFilter, extraInfoSpec)
}

