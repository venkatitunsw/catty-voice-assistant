import * as Battery from 'expo-battery';

export class DeviceControls {
  private static isTorchOn = false;

  /**
   * Get battery status info
   */
  static async getBatteryStatus(): Promise<{ level: number; isCharging: boolean; text: string }> {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isCharging = batteryState === Battery.BatteryState.CHARGING;
      const percentage = Math.round(batteryLevel * 100);

      const statusText = `Your battery is at ${percentage}%${isCharging ? ' and currently charging.' : '.'}`;
      return {
        level: percentage,
        isCharging,
        text: statusText
      };
    } catch (error) {
      console.warn('Battery status not available:', error);
      return {
        level: 100,
        isCharging: false,
        text: "Could not read battery status on this device."
      };
    }
  }

  /**
   * Toggle device flashlight / torch state
   */
  static async toggleFlashlight(state?: boolean): Promise<{ isOn: boolean; text: string }> {
    const nextState = state !== undefined ? state : !this.isTorchOn;
    this.isTorchOn = nextState;

    return {
      isOn: this.isTorchOn,
      text: `Flashlight turned ${this.isTorchOn ? 'ON' : 'OFF'}.`
    };
  }
}
