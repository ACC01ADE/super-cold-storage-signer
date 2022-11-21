/// <reference types="node" />
import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import { Bytes } from '@ethersproject/bytes';
import { TransactionRequest } from '@ethersproject/providers';
export declare class SuperColdStorageSigner extends Signer {
  readonly endpoint: URL;
  readonly authorization: string;
  readonly ca?: string;
  constructor(endpoint: string, authorization: string, provider?: Provider, ca?: string);
  connect(provider: Provider): SuperColdStorageSigner;
  getAddress(): Promise<string>;
  signMessage(message: Bytes | string): Promise<string>;
  signTransaction(transaction: TransactionRequest): Promise<string>;
  private _sign;
  private _label;
  private _request;
  private _send;
}
//# sourceMappingURL=super-cold-storage-signer.d.ts.map
