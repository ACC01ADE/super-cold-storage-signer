import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import { getAddress as sanitizeAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { Bytes, hexlify, joinSignature, SignatureLike } from '@ethersproject/bytes';
import { PopulatedTransaction } from '@ethersproject/contracts';
import { Deferrable, defineReadOnly, resolveProperties } from '@ethersproject/properties';
import { JsonRpcProvider, TransactionRequest, Web3Provider } from '@ethersproject/providers';
import { toUtf8Bytes } from '@ethersproject/strings';
import { serialize as serializeTransaction, UnsignedTransaction } from '@ethersproject/transactions';
import { Wallet } from '@ethersproject/wallet';

import { ClientRequest } from 'node:http';
import { RequestOptions } from 'node:https';
import * as http from 'node:https';

enum HttpMethod {
  GET = 'GET',
  PUT = 'PUT',
  POST = 'POST',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export class SuperColdStorageSigner extends Signer {
  readonly address!: string;
  readonly endpoint!: URL;
  readonly authorization!: string;
  readonly ca?: string;

  readonly fakeWallet!: Wallet;

  constructor(
    address: string,
    endpoint: string,
    authorization: string,
    provider?: Provider | JsonRpcProvider | Web3Provider,
    ca?: string
  ) {
    super();
    defineReadOnly(this, 'address', address);
    defineReadOnly(this, 'endpoint', new URL(endpoint));
    defineReadOnly(this, 'authorization', authorization);
    defineReadOnly(this, 'provider', provider);
    if (ca) {
      defineReadOnly(this, 'ca', ca);
    }
    defineReadOnly(this, 'fakeWallet', Wallet.fromMnemonic('test '.repeat(11) + 'junk').connect(this.provider!));
  }

  connect(provider: Provider | JsonRpcProvider | Web3Provider): SuperColdStorageSigner {
    return new SuperColdStorageSigner(this.address, this.endpoint.toString(), this.authorization, provider, this.ca);
  }

  async getAddress(): Promise<string> {
    return sanitizeAddress(await this._label());
  }

  async signMessage(message: Bytes | string): Promise<string> {
    if (typeof message === 'string') {
      message = toUtf8Bytes(message);
    }

    const messageHex: string = hexlify(message, { allowMissingPrefix: true, hexPad: 'left' }).slice(2);
    return joinSignature(await this._sign(messageHex, true));
  }

  async signTransaction(transaction: TransactionRequest | PopulatedTransaction): Promise<string> {
    let tx: TransactionRequest = await resolveProperties<TransactionRequest>(transaction);
    const originalNonce: number = tx.nonce
      ? BigNumber.from(tx.nonce).toNumber()
      : await this.provider!.getTransactionCount(this.address);
    tx.from = undefined;
    tx = await this.fakeWallet.populateTransaction(tx);
    tx.nonce = originalNonce;
    tx.from = this.address;
    let baseTx: UnsignedTransaction = {
      to: tx.to,
      nonce: tx.nonce,
      data: tx.data,
      value: tx.value,
      chainId: tx.chainId,
      type: tx.type,
      gasLimit: tx.gasLimit,
    };
    if (baseTx.type == 2) {
      baseTx.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
      baseTx.maxFeePerGas = tx.maxFeePerGas;
    } else {
      baseTx.gasPrice = tx.gasPrice;
    }
    if (baseTx.type == 1 || baseTx.type == 2) {
      baseTx.accessList = tx.accessList;
    }
    const unsignedTx: string = serializeTransaction(baseTx).slice(2);
    return serializeTransaction(baseTx, await this._sign(unsignedTx));
  }

  private async _sign(unsignedTx: string, isMessage = false): Promise<SignatureLike> {
    const result: Record<string, unknown> = await this._request(
      isMessage ? 'signMessage' : 'signTransaction',
      HttpMethod.POST,
      { message: unsignedTx }
    );
    if (Object.keys(result).includes('signature')) {
      return result.signature as SignatureLike;
    }

    throw new Error(`Could not get signature: ${JSON.stringify(result)}`);

    /*
    return {
      r: '0x0000000000000000000000000000000000000000000000000000000000000000',
      s: '0x0000000000000000000000000000000000000000000000000000000000000000',
      v: 0,
    } as SignatureLike
*/
  }

  private async _label(): Promise<string> {
    const result: Record<string, unknown> = await this._request('getLabel', HttpMethod.GET);
    if (Object.keys(result).includes('label')) {
      return result.label as string;
    }

    throw new Error(`Could not get label: ${JSON.stringify(result)}`);

    /*
    return '0x0000000000000000000000000000000000000000'
*/
  }

  private async _request(path: string, method: HttpMethod, payload?: string | Record<string, unknown>): Promise<any> {
    const requestOptions: RequestOptions = {
      hostname: this.endpoint.hostname,
      method: HttpMethod[method],
      path: '/' + this.address + '/' + path,
      port: this.endpoint.port === '' ? 443 : Number.parseInt(this.endpoint.port, 10),
      headers: {
        Accept: 'application/json;odata=verbose',
        Authorization: this.authorization,
        'Content-Type': 'application/json;odata=verbose',
      },
      ca: this.ca,
      timeout: 5 * 1000, // n seconds
      // TLS options below
      // secureProtocol: 'TLSv1_method',
    };
    return this._send(requestOptions, payload);
  }

  private async _send(options: RequestOptions, data?: string | Record<string, unknown>): Promise<any> {
    let result = '';
    const promise = new Promise((resolve, reject) => {
      const req: ClientRequest = http.request(options, (res) => {
        res.on('data', (chunk) => {
          result += chunk;
        });
        res.on('error', (err: any) => {
          console.log(err);
          reject(err);
        });
        res.on('end', () => {
          try {
            let body = result;
            // there are empty responses
            if (res.statusCode === 200) {
              body = JSON.parse(result);
            }
            resolve(body);
          } catch (error: any) {
            console.log(error);
            reject(error);
          }
        });
      });
      /***
       * handles the errors on the request
       */
      req.on('error', (err: any) => {
        console.log(err);
        reject(err);
      });
      /***
       * handles the timeout error
       */
      req.on('timeout', (err: any) => {
        console.log(err);
        req.abort();
      });
      /***
       * unhandle errors on the request
       */
      req.on('uncaughtException', (err: any) => {
        console.log(err);
        req.abort();
      });
      /**
       * adds the payload/body
       */
      if (data) {
        const body: string = typeof data === 'string' ? (data as string) : JSON.stringify(data);
        req.write(body);
      }

      /**
       * end the request to prevent ECONNRESETand socket hung errors
       */
      req.end(() => {});
    });
    return promise;
  }
}
