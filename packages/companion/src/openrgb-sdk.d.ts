// openrgb-sdk ships type files but its package.json does not point at them. Only what we use is declared.
declare module "openrgb-sdk" {
  export interface RGBColor {
    red: number;
    green: number;
    blue: number;
  }
  export interface Device {
    deviceId: number;
    type: number;
    name: string;
    activeMode: number;
    leds: { name: string; value: number }[];
    colors: RGBColor[];
  }
  export class Client {
    constructor(name?: string, port?: number, host?: string);
    connect(timeout?: number): Promise<void>;
    disconnect(): void;
    getAllControllerData(): Promise<Device[]>;
    updateLeds(deviceId: number, colors: RGBColor[]): void;
    updateMode(deviceId: number, mode: number | string): Promise<void>;
  }
  const sdk: { Client: typeof Client };
  export default sdk;
}
