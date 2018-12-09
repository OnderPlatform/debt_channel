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
    const settlementPeriod = 0

    specify('add debt', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('pass if sigMine is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureB = await signature(BOB, digest)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureB, signatureB))
    })

    specify('ok if signed by my delegate key', async () => {
      await instanceA.addSigner(DELEGATE_ALICE, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(DELEGATE_ALICE, digest)
      const signatureB = await signature(BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('ok if signed by others delegate key', async () => {
      await instanceB.addSigner(DELEGATE_BOB, {from: BOB})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(DELEGATE_BOB, digest)
      const tx = await instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureB)
      assert(contracts.Holding.isDidAddDebtEvent(tx.logs[0]))
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')
    })

    specify('pass if sigOther is incorrect', async () => {
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureA))
    })

    specify('can not override', async () => {
      const digest1 = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest1)
      const signatureB = await signature(BOB, digest1)
      await instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureB)
      const rawDebt = await instanceA.debts(instanceB.address, token.address)
      const debt = Debt.fromContract(rawDebt)
      assert.equal(debt.amount.toString(), amount.toString())
      assert.notEqual(debt.collectionAfter.toString(), '0')

      const amount2 = 20
      const digest2 = await instanceA.addDebtDigest(instanceB.address, token.address, amount2)
      const signatureA2 = await signature(ALICE, digest2)
      const signatureB2 = await signature(BOB, digest2)
      return assert.isRejected(instanceA.addDebt(instanceB.address, token.address, amount2, settlementPeriod, signatureA2, signatureB2))
    })
  })

  describe('collect', () => {
    const amount = 10
    const settlementPeriod = 0

    specify('collect', async () => {
      await token.approve(instanceA.address, 1000, {from: ALICE})
      await instanceA.deposit(token.address, 10, {from: ALICE})
      const digest = await instanceA.addDebtDigest(instanceB.address, token.address, amount)
      const signatureA = await signature(ALICE, digest)
      const signatureB = await signature(BOB, digest)
      await instanceA.addDebt(instanceB.address, token.address, amount, settlementPeriod, signatureA, signatureB)
      const collectDigest = await instanceA.collectDigest(token.address)
      const collectSignature = await signature(BOB, collectDigest)

      const balanceBefore = await token.balanceOf(instanceB.address)
      const holdingBefore = await instanceB.deposits(token.address)
      let tx = await instanceA.collect(instanceB.address, token.address, collectSignature)
      assert(contracts.Holding.isDidCloseEvent(tx.logs[0]))
      assert(contracts.Holding.isDidCollectEvent(tx.logs[1]))
      const balanceAfter = await token.balanceOf(instanceB.address)

      assert.equal(balanceAfter.sub(balanceBefore).toString(), amount.toString())


      const holdingAfter = await instanceB.deposits(token.address)
      assert.equal(holdingAfter.sub(holdingBefore).toString(), amount.toString())
    })
  })

  specify('withdraw', async () => {
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, 100, {from: ALICE})
    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.deposits(token.address)
    assert.equal(holdingBalance.toString(), '100')

    const withdrawal = 10
    const digest = await instanceA.withdrawDigest(BOB, token.address, withdrawal)
    const signatureA = await signature(ALICE, digest)
    const balanceBefore = await token.balanceOf(BOB)
    await instanceA.withdraw(BOB, token.address, withdrawal, signatureA)
    const balanceAfter = await token.balanceOf(BOB)
    assert.equal(balanceAfter.sub(balanceBefore).toString(), withdrawal.toString())
    const holdingBalanceAfter = await instanceA.deposits(token.address)
    assert.equal(holdingBalanceAfter.sub(holdingBalance).toString(), (-1 * withdrawal).toString())
  })

  specify('forgive', async () => {
    await token.approve(instanceA.address, 1000, {from: ALICE})
    await instanceA.deposit(token.address, 100, {from: ALICE})
    const tokenBalance = await token.balanceOf(instanceA.address)
    assert.equal(tokenBalance.toString(), '100')
    const holdingBalance = await instanceA.deposits(token.address)
    assert.equal(holdingBalance.toString(), '100')

    const digest = await instanceA.forgiveDigest(instanceB.address, token.address)
    const signatureA = await signature(ALICE, digest)
    const signatureB = await signature(BOB, digest)
    await instanceA.forgive(instanceB.address, token.address, signatureA, signatureB)
    const rawDebt = await instanceA.debts(instanceB.address, token.address)
    const debt = Debt.fromContract(rawDebt)
    assert.equal(debt.amount.toString(), '0')
    assert.equal(debt.collectionAfter.toString(), '0')
  })
})
