declare class base64js {
    static byteLength: (encoded: string) => number;
    static toByteArray: (encoded: string)=> Uint8Array;
    static fromByteArray: (bytes: Uint8Array) => string;
}
