/// <reference types="node" />
import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import { Bytes } from '@ethersproject/bytes';
import { PopulatedTransaction } from '@ethersproject/contracts';
import { JsonRpcProvider, TransactionRequest, Web3Provider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
export declare class SuperColdStorageSigner extends Signer {
  readonly address: string;
  readonly endpoint: URL;
  readonly authorization: string;
  readonly ca?: string;
  readonly fakeWallet: Wallet;
  constructor(
    address: string,
    endpoint: string,
    authorization: string,
    provider?: Provider | JsonRpcProvider | Web3Provider,
    ca?: string
  );
  connect(provider: Provider | JsonRpcProvider | Web3Provider): SuperColdStorageSigner;
  getAddress(): Promise<string>;
  signMessage(message: Bytes | string): Promise<string>;
  signTransaction(transaction: TransactionRequest | PopulatedTransaction): Promise<string>;
  private _sign;
  private _label;
  private _request;
  private _send;
}
//# sourceMappingURL=super-cold-storage-signer.d.ts.map
