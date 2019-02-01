import { BigNumber } from 'bignumber.js'

export interface Debt {
  destination: string,
  token: string,
  collectionAfter: BigNumber
  amount: BigNumber,
  salt: string
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
