import zeppDevices from "../data/zepp_devices.json";

export type DeviceInfo = {
    id?: string;
    screenWidth: number;
    screenHeight: number;
    deviceName: string;
    deviceSource?: number;
    hasOverlay?: boolean;
    circleScreen?: boolean;
    screenShape?: "round" | "square" | "pill" | "band";
    screenRadius?: number;
    radius?: number;
    defaultApi?: string;
    apiLevel?: string;
    enablePropBanList?: boolean;
    swapRedAndBlueTGA?: boolean;
    defaultFontSize?: number | null;
    useAbsolutePathsInHuamiFS?: boolean;
}

export function getDeviceProfiles(): { [p: string]: DeviceInfo } {
    const devices: {[id: string]: DeviceInfo} = {};

    for(const row of (zeppDevices as any[])) {
        const shape = (row.screenShape || (row.circleScreen ? "round" : "square")) as "round" | "square" | "pill" | "band";
        const radius = row.radius ?? row.screenRadius ?? (shape === "round" ? Math.round(row.screenWidth / 2) : (shape === "pill" ? Math.round(row.screenWidth / 2) : 0));
        const api = row.defaultApi || row.apiLevel || row.osVersion || "1.0.0";

        const info: DeviceInfo = {
            id: row.id,
            circleScreen: shape === "round",
            screenShape: shape,
            screenRadius: radius,
            radius: radius,
            defaultApi: api,
            apiLevel: api,
            deviceName: row.deviceName,
            deviceSource: Array.isArray(row.deviceSource) ? row.deviceSource[0] : row.deviceSource,
            screenHeight: row.screenHeight,
            screenWidth: row.screenWidth,
            hasOverlay: ["mi_band7", "mi-band-7", "band7", "amazfit-band-7", "gts4", "gts4mini", "amazfit-gts-4-mini"].indexOf(row.id) > -1,
            swapRedAndBlueTGA: ["mi_band7", "mi-band-7", "band7", "amazfit-band-7", "gts4mini", "amazfit-gts-4-mini"].indexOf(row.id) < 0,
            defaultFontSize: (row.id === "gts4mini" || row.id === "amazfit-gts-4-mini") ? 12 : null,
            enablePropBanList: row.id === "mi_band7" || row.id === "mi-band-7",
            useAbsolutePathsInHuamiFS: row.id === "mi_band7" || row.id === "mi-band-7",
        };

        devices[row.id] = info;

        if (Array.isArray(row.alternativeDeviceNames)) {
            for (const alt of row.alternativeDeviceNames) {
                if (!devices[alt]) {
                    devices[alt] = info;
                }
            }
        }
    }

    return devices;
}
