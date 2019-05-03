{
    const injectScript = (func, params) => {
        const script = document.createElement('script');
        if (typeof (func) === 'function')
            script.innerHTML = '(' + func.toString() + ')(' + (params ? params.map(o => JSON.stringify(o)).join(', ') : '') + ');';
        else if (typeof (func) === 'string')
            script.innerHTML = func;
        // self remove script
        script.addEventListener('load', () => document.documentElement.removeChild(script), true /*useCapture*/);
        let parent = (document.head || document.body || document.documentElement);
        let firstChild = (parent.childNodes && (parent.childNodes.length > 0)) ? parent.childNodes[0] : null;
        parent.insertBefore(script, parent.firstChild || null);
    };

    // fake touche event capability
    /*
    addTouch = () => {
        const { createEvent } = document;
        navigator.maxTouchPoints = 10;
        console.log('addTouch navigator.maxTouchPoints:' + navigator.maxTouchPoints);
        document.createEvent2 = function () {
            type = arguments[0];
            console.log(arguments);
            console.log(type);
            if (type == 'TouchEvent')
                arguments[0] = 'event';
            return createEvent.apply(navigator, arguments);
        }
        window.ontouchstart = true;
    }
    */

    // random hash
    randomize = () => {
        r = (max) => Math.floor(Math.random() * max);
        permutation = r(9) + 1;
        let keys = Object.keys(window).slice(0, 100);
        //console.log(keys);
        for (let i = 0; i < permutation; i++) {
            try {
                const pivot = keys[i];
                delete window[keys[i]];
                window[keys[i]] = pivot;
            } catch (e) {
                console.error(e);
            }
        }
        //console.log(Object.keys(window).slice(0, 100));
    }
    // injectScript(addTouch)
    injectScript(randomize)
}
