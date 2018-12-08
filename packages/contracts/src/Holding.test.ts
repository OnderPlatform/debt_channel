import * as Web3 from 'web3'
import * as chai from 'chai'
import * as BigNumber from 'bignumber.js'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as util from 'ethereumjs-util'
import * as sigUtil from 'eth-sig-util'
import TestToken from './wrappers/TestToken'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3
const assert = chai.assert

const Holding = artifacts.require<contracts.Holding.Contract>('Holding.sol')
const Token = artifacts.require<TestToken.Contract>('support/TestToken.sol')

const WRONG_CHANNEL_ID = '0xdeadbeaf'
const WRONG_SIGNATURE = '0xcafebabe'

async function signature (signer: string, digestHex: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const checksummed = util.toChecksumAddress(signer)
    web3.eth.sign(digestHex, checksummed, (err, signature) => {
      err ? reject(err) : resolve(signature)
    })
  })
}

contract('Holding', accounts => {
  const ALICE = accounts[0]
  const BOB = accounts[1]

  let instanceA: contracts.Holding.Contract
  let instanceB: contracts.Holding.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(ALICE, 1000)
    await token.mint(BOB, 1000)
    instanceA = await Holding.new()
    instanceB = await Holding.new()
  })

  specify('constructor', async () => {
    const holding = await Holding.new({from: ALICE})
    const owner = await holding.owner()
    assert.equal(owner, ALICE)
  })

  specify('.deposit', async () => {
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, 100, {from: ALICE})
    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.deposits(token.address)
    assert.equal(holdingBalance.toString(), '100')
  })

  describe('.addDebt', () => {
    specify('add debt', async () => {
      const amount = 10
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, signatureA, signatureA)
      const event = tx.logs[0]
      assert(contracts.Holding.isDidAddDebtEvent(event))
      const debt = await instanceA.debts(instanceB.address, token.address)
      assert.equal(debt.toString(), '10')
    })

    specify('pass if sigMine is incorrect', async () => {
    })

    specify('ok if signed by delegate key', async () => {
    })

    specify('pass if sigOther is incorrect', async () => {

    })
  })
})
