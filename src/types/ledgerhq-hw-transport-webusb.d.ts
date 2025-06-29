declare module '@ledgerhq/hw-transport-webusb' {
  export default class TransportWebUSB {
    static create(): Promise<TransportWebUSB>;
    send(cla: number, ins: number, p1: number, p2: number, data: Buffer, statusList: number[]): Promise<Buffer>;
    close(): Promise<void>;
  }
} 