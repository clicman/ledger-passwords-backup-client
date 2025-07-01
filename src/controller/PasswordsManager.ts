import TransportWebUSB from '@ledgerhq/hw-transport-webusb';

const allowedStatuses = [
  0x9000, 0x6985, 0x6a86, 0x6a87, 0x6d00, 0x6e00, 0xb000,
];

const insAPDU = {
  GET_APP_INFO_COMMAND: 0x01,
  GET_APP_CONFIG_COMMAND: 0x03,
  DUMP_METADATAS_COMMAND: 0x04,
  LOAD_METADATAS_COMMAND: 0x05,
};

const passwordsCharsets = {
  UPPERCASE: 1,
  LOWERCASE: 2,
  NUMBERS: 4,
  MINUS: 8,
  UNDERLINE: 16,
  SPACE: 32,
  SPECIAL: 64,
  BRACKETS: 128,
};

const allPasswordsCharsets = 0xff;

interface Metadata {
  nickname: string;
  charsets: string[];
}

interface MetadataResult {
  parsed: Metadata[];
  nicknames_erased_but_still_stored: Metadata[];
  corruptions_encountered: any[];
  raw_metadatas: string;
}

interface AppConfig {
  storage_size: number;
  keyboard_type: number;
  press_enter_after_typing: number;
}

class PasswordsManager {
  public connected: boolean;
  private busy: boolean;
  private transport: TransportWebUSB | null;
  private version?: string;
  private storage_size?: number;

  constructor() {
    this.connected = false;
    this.busy = false;
    this.transport = null;
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      if (!this.transport) this.transport = await TransportWebUSB.create();
      try {
        const [appName, version] = await this.getAppInfo();
        if (appName.toString() !== 'Passwords')
          throw new Error('The Passwords app is not opened on the device');
        this.version = version;
        let appConfig = await this.getAppConfig();
        this.storage_size = appConfig['storage_size'];
        this.connected = true;
      } catch (error) {
        await this.transport!.close();
        this.disconnect();
        throw error;
      }
    }
  }

  isSuccess(result: Buffer): boolean {
    return (
      result.length >= 2 && result.readUInt16BE(result.length - 2) === 0x9000
    );
  }

  disconnect(): void {
    this.connected = false;
    this.transport = null;
  }

  mapProtocolError(result: Buffer): void {
    if (result.length < 2) throw new Error('Response length is too small');

    const errors: { [key: number]: string } = {
      0x6985: 'Action cancelled',
      0x6a86: 'SW_WRONG_P1P2',
      0x6a87: 'SW_WRONG_DATA_LENGTH',
      0x6d00: 'SW_INS_NOT_SUPPORTED',
      0x6e00: 'SW_CLA_NOT_SUPPORTED',
      0xb000: 'SW_APPNAME_TOO_LONG',
      0x6f10: 'SW_METADATAS_PARSING_ERROR',
    };

    let error = result.readUInt16BE(result.length - 2);
    if (error in errors) {
      throw new Error(errors[error]);
    }
  }

  private _lock(): void {
    if (this.busy) throw new Error('Device is busy');
    this.busy = true;
  }

  private _unlock(): void {
    this.busy = false;
  }

  private _charsetListToBitmask(charsets: string[]): number {
    let bitmask = 0x00;
    for (const charset of charsets) {
      bitmask |= (passwordsCharsets as any)[charset];
    }
    if (bitmask === 0x00) bitmask = allPasswordsCharsets;
    return bitmask;
  }

  private _bitmaskToCharsetList(bitmask: number): string[] {
    let charsetList: string[] = [];
    if (bitmask === 0x00 || bitmask === allPasswordsCharsets) {
      charsetList.push('ALL_SETS');
    } else {
      for (const charset in passwordsCharsets) {
        if ((passwordsCharsets as any)[charset] & bitmask)
          charsetList.push(charset);
      }
    }
    return charsetList;
  }

  private _toBytes(json_metadatas: string): Buffer {
    if (!this.storage_size) throw new Error('Storage size not initialized');

    let metadatas = Buffer.alloc(this.storage_size);
    let parsed_metadatas = JSON.parse(json_metadatas)['parsed'];
    let offset = 0;
    parsed_metadatas.forEach((element: any) => {
      let nickname = element['nickname'];
      let charsets = this._charsetListToBitmask(element['charsets']);
      if (nickname.length > 19)
        throw new Error(
          `Nickname too long (19 max): ${nickname} has length ${nickname.length}`,
        );
      if (offset + 3 + nickname.length >= this.storage_size!)
        throw new Error(
          `Not enough memory on this device to restore this backup`,
        );
      metadatas[offset++] = nickname.length + 1;
      metadatas[offset++] = 0x00;
      metadatas[offset++] = charsets;
      metadatas.write(nickname, offset);
      offset += nickname.length;
    });
    // mark free space at the end of the buffer
    metadatas[offset++] = 0x00;
    metadatas[offset++] = 0x00;
    return metadatas;
  }

  private _toJSON(metadatas: Buffer): MetadataResult {
    let metadatas_list: Metadata[] = [];
    let erased_list: Metadata[] = [];
    let offset = 0;
    let corruptions: any[] = [];
    while (true) {
      let len = metadatas[offset];
      if (len === 0) break;
      let erased = metadatas[offset + 1] === 0xff ? true : false;
      let charsets = metadatas[offset + 2];
      if (len > 19 + 1)
        corruptions.push(offset, `nickname too long ${len}, max is 19`);
      let metadata: Metadata = {
        nickname: metadatas.slice(offset + 3, offset + 2 + len).toString(),
        charsets: this._bitmaskToCharsetList(charsets),
      };
      erased ? erased_list.push(metadata) : metadatas_list.push(metadata);
      offset += len + 2;
    }
    return {
      parsed: metadatas_list,
      nicknames_erased_but_still_stored: erased_list,
      corruptions_encountered: corruptions,
      raw_metadatas: metadatas.toString('hex'),
    };
  }

  private async _load_metadatas_chunk(
    chunk: Buffer,
    is_last: boolean,
  ): Promise<Buffer> {
    if (!this.transport) throw new Error('Transport not initialized');

    let result = await this.transport.send(
      0xe0,
      insAPDU.LOAD_METADATAS_COMMAND,
      is_last ? 0xff : 0x00,
      0x00,
      Buffer.from(chunk),
      allowedStatuses,
    );
    if (!this.isSuccess(result)) this.mapProtocolError(result);
    return result;
  }

  async getAppInfo(): Promise<[string, string]> {
    this._lock();
    try {
      if (!this.transport) throw new Error('Transport not initialized');

      let result = await this.transport.send(
        0xb0,
        insAPDU.GET_APP_INFO_COMMAND,
        0x00,
        0x00,
        Buffer.alloc(0),
        allowedStatuses,
      );
      if (!this.isSuccess(result)) this.mapProtocolError(result);

      result = result.slice(0, result.length - 2);
      let app_name: string, app_version: string;
      try {
        let offset = 1;
        let app_name_length = result[offset++];
        app_name = result.slice(offset, offset + app_name_length).toString();
        offset += app_name_length;
        let app_version_length = result[offset++];
        app_version = result
          .slice(offset, offset + app_version_length)
          .toString();
        return [app_name, app_version];
      } catch (error) {
        throw new Error(
          `Unexpected result from device, parsing error: ${error}`,
        );
      }
    } finally {
      this._unlock();
    }
  }

  async getAppConfig(): Promise<AppConfig> {
    this._lock();
    try {
      if (!this.transport) throw new Error('Transport not initialized');

      let result = await this.transport.send(
        0xe0,
        insAPDU.GET_APP_CONFIG_COMMAND,
        0x00,
        0x00,
        Buffer.alloc(0),
        allowedStatuses,
      );
      if (!this.isSuccess(result)) this.mapProtocolError(result);
      result = result.slice(0, result.length - 2);
      if (result.length !== 6)
        throw new Error(`Can't parse app config of length ${result.length}`);

      let storage_size = result.readUInt32BE(0);
      let keyboard_type = result[4];
      let press_enter_after_typing = result[5];
      return { storage_size, keyboard_type, press_enter_after_typing };
    } finally {
      this._unlock();
    }
  }

  async dump_metadatas(): Promise<MetadataResult> {
    this._lock();
    try {
      if (!this.transport || !this.storage_size)
        throw new Error('Not properly initialized');

      let metadatas = Buffer.alloc(0);
      while (metadatas.length < this.storage_size) {
        let result = await this.transport.send(
          0xe0,
          insAPDU.DUMP_METADATAS_COMMAND,
          0x00,
          0x00,
          Buffer.alloc(0),
          allowedStatuses,
        );
        if (!this.isSuccess(result)) this.mapProtocolError(result);
        metadatas = Buffer.concat([
          metadatas,
          Buffer.from(result.slice(1, -2)),
        ]);
        if (result[0] === 0xff && metadatas.length < this.storage_size) {
          throw new Error(
            `${this.storage_size} bytes requested but only ${metadatas.length} bytes available`,
          );
        }
      }
      return this._toJSON(metadatas);
    } finally {
      this._unlock();
    }
  }

  async load_metadatas(JSON_metadatas: string): Promise<void> {
    this._lock();
    try {
      let metadatas = this._toBytes(JSON_metadatas);
      if (metadatas.length === 0) {
        throw new Error('No data to load');
      }
      for (let i = 0; i < metadatas.length; i += 0xff) {
        let chunk = metadatas.slice(i, i + 0xff);
        await this._load_metadatas_chunk(
          chunk,
          i + chunk.length === metadatas.length ? true : false,
        );
      }
    } finally {
      this._unlock();
    }
  }
}

export default PasswordsManager;
