import { BigNumber } from 'bignumber.js'

export interface Debt {
  destination: string,
  token: string,
  collectionAfter: BigNumber
  amount: BigNumber,
  salt: string
}

export namespace Debt {
  export function fromContract (r: [string, string, BigNumber, BigNumber, BigNumber]) {
    const destination = r[0]
    const token = r[1]
    const collectionAfter = r[2]
    const amount = r[3]
    const salt = r[4]
    return {
      destination,
      token,
      collectionAfter,
      amount,
      salt
    }
  }
}
