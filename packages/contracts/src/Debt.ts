import { BigNumber } from 'bignumber.js'

export interface Debt {
  amount: BigNumber,
  collectionAfter: BigNumber
}

export namespace Debt {
  export function fromContract(r: [BigNumber, BigNumber]) {
    const collectionAfter = r[0]
    const amount = r[1]
    return {
      amount,
      collectionAfter
    }
  }
}
