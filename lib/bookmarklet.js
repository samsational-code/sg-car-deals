// Turns lib/parse.js + lib/capture.js into the text of the "Scan SGCarMart" bookmark.
// A bookmark cannot load modules, so the two files are joined into one self-contained script.

function strip(source) {
  return source
    .replace(/^import .*$/gm, '')                    // module wiring is not needed once the files are joined
    .replace(/^export \{[^}]*\};?$/gm, '')
    .replace(/^export\s+/gm, '')
    .split('\n').filter((line) => !/^\s*(\/\/|\/\*\*|\*\/|\*(\s|$))/.test(line) && line.trim()).join('\n');   // whole-line comments and blanks
}

/** The script the bookmark runs. dashUrl is the dashboard's own address (no # part). */
export function bookmarkletCode(parseSource, captureSource, dashUrl) {
  return `void (async () => {\n${strip(parseSource)}\n${strip(captureSource)}\nawait runCapture(window, ${JSON.stringify(dashUrl)});\n})()` +
    `.catch((e) => { alert('SG Car Deals could not read this page: ' + (e && e.message ? e.message : e)); });`;
}

export function bookmarkletHref(parseSource, captureSource, dashUrl) {
  return 'javascript:' + encodeURIComponent(bookmarkletCode(parseSource, captureSource, dashUrl));
}
