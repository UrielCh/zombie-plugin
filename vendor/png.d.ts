interface pngImage {
    pixels: Uint8Array;
    width: number;
    height: number;
}
declare class PNGReader {
    constructor(data: Uint8Array);
    parse: (callback: (error:any, png:pngImage) =>void) => void;
}
