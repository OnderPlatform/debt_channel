import * as Web3 from 'web3'
import * as chai from 'chai'
import { BigNumber } from 'bignumber.js'
import * as asPromised from 'chai-as-promised'
import * as contracts from './'
import * as util from 'ethereumjs-util'
import * as sigUtil from 'eth-sig-util'
import TestToken from './wrappers/TestToken'
import { Debt } from './';

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
  const DELEGATE_ALICE = accounts[2]
  const DELEGATE_BOB = accounts[3]

  let instanceA: contracts.Holding.Contract
  let instanceB: contracts.Holding.Contract
  let token: TestToken.Contract

  beforeEach(async () => {
    token = await Token.new()
    await token.mint(ALICE, 1000)
    await token.mint(BOB, 1000)
    instanceA = await Holding.new({from: ALICE})
    instanceB = await Holding.new({from: BOB})
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
    const amount = 10
    const nonce = 1
    const collectionAfter = 64754899200

    specify('add debt', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, nonce, collectionAfter, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.nonce.toString(), nonce.toString())
      assert.equal(debt.collectionAfter.toString(), collectionAfter.toString())
    })

    specify('pass if sigMine is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureB = await signature(BOB, digest)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount,nonce, collectionAfter, signatureB, signatureB))
    })

    specify('ok if signed by my delegate key', async () => {
      await instanceA.addSigner(DELEGATE_ALICE, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureA = await signature(DELEGATE_ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, nonce, collectionAfter, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.nonce.toString(), nonce.toString())
      assert.equal(debt.collectionAfter.toString(), collectionAfter.toString())
    })

    specify('ok if signed by others delegate key', async () => {
      await instanceB.addSigner(DELEGATE_BOB, {from: BOB})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(DELEGATE_BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, nonce, collectionAfter, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.nonce.toString(), nonce.toString())
      assert.equal(debt.collectionAfter.toString(), collectionAfter.toString())
    })

    specify('pass if sigOther is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureA = await signature(ALICE, digest)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, nonce, collectionAfter, signatureA, signatureA))
    })

    specify('override', async () => {
      const digest1 = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, collectionAfter)
      const signatureA = await signature(ALICE, digest1)
      const signatureB = await signature(BOB, digest1)
      await instanceA.addDebt(instanceB.address, token.address, amount, nonce, collectionAfter, signatureA, signatureB)
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.nonce.toString(), nonce.toString())
      assert.equal(debt.collectionAfter.toString(), collectionAfter.toString())

      const amount2 = 20
      const nonce2 = 20
      const collectionAfter2 = 20
      const digest2 = await instanceA.addDebtDigest(instanceB.address, token.address, amount2, nonce2, collectionAfter2)
      const signatureA2 = await signature(ALICE, digest2)
      const signatureB2 = await signature(BOB, digest2)
      await instanceA.addDebt(instanceB.address, token.address, amount2, nonce2, collectionAfter2, signatureA2, signatureB2)
    })

    specify('can not override after collection time', async () => {
      const localCollectionAfter = 0
      const digest1 = await instanceA.addDebtDigest(instanceB.address, token.address, amount, nonce, localCollectionAfter)
      const signatureA = await signature(ALICE, digest1)
      const signatureB = await signature(BOB, digest1)
      await instanceA.addDebt(instanceB.address, token.address, amount, nonce, localCollectionAfter, signatureA, signatureB)
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.equal(debt.nonce.toString(), nonce.toString())
      assert.equal(debt.collectionAfter.toString(), localCollectionAfter.toString())

      const amount2 = 20
      const nonce2 = 20
      const collectionAfter2 = 20
      const digest2 = await instanceA.addDebtDigest(instanceB.address, token.address, amount2, nonce2, collectionAfter2)
      const signatureA2 = await signature(ALICE, digest2)
      const signatureB2 = await signature(BOB, digest2)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount2, nonce2, collectionAfter2, signatureA2, signatureB2))
    })
  })
})
