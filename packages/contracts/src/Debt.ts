import { BigNumber } from 'bignumber.js'

export interface Debt {
  nonce: BigNumber,
  amount: BigNumber,
  collectionAfter: BigNumber
}

export namespace Debt {
  export function fromContract(r: [BigNumber, BigNumber, BigNumber]) {
    const nonce = r[0]
    const collectionAfter = r[1]
    const amount = r[2]
    return {
      nonce,
      amount,
      collectionAfter
    }
  }
}
