
// copy from from node_modules/typescript/lib/lib.dom.d.ts

export interface GeolocationCoordinates {
    readonly accuracy: number;
    readonly altitude: number | null;
    readonly altitudeAccuracy: number | null;
    readonly heading: number | null;
    readonly latitude: number;
    readonly longitude: number;
    readonly speed: number | null;
}
export interface GeolocationPosition {
    readonly coords: GeolocationCoordinates;
    readonly timestamp: number;
}
