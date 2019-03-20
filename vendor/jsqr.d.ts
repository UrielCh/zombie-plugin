// export {}; // this file needs to be a module

//import { Chunks } from "./decoder/decodeData";
export interface Point {
    x: number;
    y: number;
}
export interface QRCode {
    binaryData: number[];
    data: string;
    // chunks: Chunks;
    location: {
        topRightCorner: Point;
        topLeftCorner: Point;
        bottomRightCorner: Point;
        bottomLeftCorner: Point;
        topRightFinderPattern: Point;
        topLeftFinderPattern: Point;
        bottomLeftFinderPattern: Point;
        bottomRightAlignmentPattern?: Point;
    };
}
export interface Options {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
    depth?: number;
}
// declare function jsQR(data: Uint8ClampedArray, width: number, height: number, providedOptions?: Options): QRCode | null;
// export default jsQR;

//declare global {
declare function jsQR(data: Uint8ClampedArray | Uint8Array, width: number, height: number, providedOptions?: Options): QRCode | null;
//}

// declare function jsQR(data: Uint8ClampedArray, width: number, height: number, providedOptions?: Options): QRCode | null;
export default jsQR;