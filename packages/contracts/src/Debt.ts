import { BigNumber } from 'bignumber.js'

export interface Debt {
  destination: string,
  token: string,
  collectionAfter: BigNumber
  amount: BigNumber,
  nonce: string
}

export class Debt {
  static fromContract (r: [string, string, BigNumber, BigNumber, BigNumber]) {
    const destination = r[0]
    const token = r[1]
    const collectionAfter = r[2]
    const amount = r[3]
    const nonce = r[4]
    return {
      destination,
      token,
      collectionAfter,
      amount,
      nonce
    }
  }
}
